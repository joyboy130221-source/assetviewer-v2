const { query, encryptSecret, decryptSecret } = require("../../lib/db");
const { requireAuth } = require("../../lib/auth");
const serviceBus = require("../../lib/service-bus");
const { writeMessageBusLog } = require("../../lib/message-bus-log");

async function getConnection(id) {
  const result = await query(
    "SELECT * FROM message_bus_connections WHERE id=$1 AND active=TRUE LIMIT 1",
    [id],
  );
  if (!result.rows[0])
    throw Object.assign(
      new Error("Messaging connection not found or inactive."),
      { status: 404 },
    );
  return result.rows[0];
}

function publicConnection(row) {
  const { connection_string, ...safe } = row;
  return { ...safe, credentialConfigured: Boolean(connection_string) };
}

module.exports = async (req, res) => {
  const user = await requireAuth(req, res, "messaging");
  if (!user) return;
  try {
    const op = String(req.query?.op || "connections");
    if (op === "connections") {
      if (req.method === "GET") {
        const result = await query(
          "SELECT * FROM message_bus_connections ORDER BY name",
        );
        return res.json({ data: result.rows.map(publicConnection) });
      }
      const body = req.body || {};
      if (req.method === "POST") {
        if (!body.name || !body.connectionString)
          return res
            .status(400)
            .json({ error: "Name and Connection String are required." });
        await query(
          `INSERT INTO message_bus_connections(name,description,provider,connection_string,active) VALUES($1,$2,'azureServiceBus',$3,$4)`,
          [
            body.name.trim(),
            body.description || "",
            encryptSecret(body.connectionString),
            body.active !== false,
          ],
        );
        return res.json({
          message: "Messaging connection created successfully.",
        });
      }
      if (req.method === "PUT") {
        const existing = await query(
          "SELECT connection_string FROM message_bus_connections WHERE id=$1",
          [body.id],
        );
        if (!existing.rows[0])
          return res
            .status(404)
            .json({ error: "Messaging connection not found." });
        const secret = body.connectionString
          ? encryptSecret(body.connectionString)
          : existing.rows[0].connection_string;
        await query(
          `UPDATE message_bus_connections SET name=$1,description=$2,connection_string=$3,active=$4,updated_at=NOW() WHERE id=$5`,
          [
            body.name.trim(),
            body.description || "",
            secret,
            body.active !== false,
            body.id,
          ],
        );
        return res.json({
          message: "Messaging connection updated successfully.",
        });
      }
      if (req.method === "DELETE") {
        await query("DELETE FROM message_bus_connections WHERE id=$1", [
          body.id,
        ]);
        return res.json({
          message: "Messaging connection deleted successfully.",
        });
      }
    }

    const body = req.body || {};
    const connection = await getConnection(
      body.connectionId || req.query?.connectionId,
    );
    const secret = decryptSecret(connection.connection_string);
    if (op === "test" && req.method === "POST") {
      const started = Date.now();
      await serviceBus.testConnection(secret);
      return res.json({
        message: "Connection successful.",
        durationMs: Date.now() - started,
      });
    }
    if (op === "entities" && req.method === "GET") {
      return res.json(await serviceBus.listEntities(secret));
    }
    if (op === "send" && req.method === "POST") {
      if (!body.destination || !body.destinationType)
        return res
          .status(400)
          .json({ error: "Destination type and destination are required." });
      const started = Date.now();
      try {
        const result = await serviceBus.sendMessage(
          secret,
          body.destinationType,
          body.destination,
          body,
        );
        const durationMs = Date.now() - started;
        const logId = await writeMessageBusLog({
          source: "MANUAL",
          connectionId: connection.id,
          connectionName: connection.name,
          destinationType: body.destinationType,
          destination: body.destination,
          messageId: result.messageId || body.messageId,
          correlationId: result.correlationId || body.correlationId,
          messageFormat: body.messageFormat,
          contentType: body.contentType,
          applicationProperties: body.applicationProperties,
          messageBody: body.body,
          success: true,
          durationMs,
          userId: user.id,
        });
        return res.json({
          message: "Message sent successfully.",
          durationMs,
          result,
          logId,
        });
      } catch (sendError) {
        const durationMs = Date.now() - started;
        await writeMessageBusLog({
          source: "MANUAL",
          connectionId: connection.id,
          connectionName: connection.name,
          destinationType: body.destinationType,
          destination: body.destination,
          messageId: body.messageId,
          correlationId: body.correlationId,
          messageFormat: body.messageFormat,
          contentType: body.contentType,
          applicationProperties: body.applicationProperties,
          messageBody: body.body,
          success: false,
          durationMs,
          errorMessage: sendError.message,
          userId: user.id,
        }).catch(() => {});
        throw sendError;
      }
    }
    if (op === "peek" && req.method === "GET") {
      if (!req.query?.queue)
        return res.status(400).json({ error: "Queue is required." });
      const data = await serviceBus.peekMessages(
        secret,
        req.query.queue,
        req.query.maxCount,
      );
      return res.json({ data });
    }
    if (op === "topicDetails" && req.method === "GET") {
      if (!req.query?.topic)
        return res.status(400).json({ error: "Topic is required." });
      return res.json(
        await serviceBus.getTopicDetails(secret, req.query.topic),
      );
    }
    if (op === "peekSubscription" && req.method === "GET") {
      if (!req.query?.topic || !req.query?.subscription)
        return res
          .status(400)
          .json({ error: "Topic and subscription are required." });
      const data = await serviceBus.peekSubscriptionMessages(
        secret,
        req.query.topic,
        req.query.subscription,
        req.query.maxCount,
      );
      return res.json({ data });
    }
    if (op === "deadLetters" && req.method === "GET") {
      const destinationType = String(req.query?.destinationType || "");
      const destination = String(req.query?.destination || "");
      if (!destination || !["queue", "topic"].includes(destinationType))
        return res
          .status(400)
          .json({ error: "Destination type and destination are required." });
      const data = await serviceBus.peekDeadLetters(
        secret,
        destinationType,
        destination,
        req.query?.subscription || null,
        req.query?.maxCount || 50,
      );
      return res.json({ data });
    }
    return res.status(405).json({ error: "Unsupported messaging operation." });
  } catch (error) {
    return res
      .status(error.status || (error.code === "23505" ? 409 : 500))
      .json({
        error:
          error.code === "23505"
            ? "Connection Name already exists."
            : error.message,
      });
  }
};
