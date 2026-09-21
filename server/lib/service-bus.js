const crypto = require("crypto");

function loadSdk() {
  try {
    return require("@azure/service-bus");
  } catch (error) {
    throw Object.assign(
      new Error(
        "Azure Service Bus SDK is not installed. Run npm install before using Messaging.",
      ),
      { status: 500, cause: error },
    );
  }
}

function normalizeMessageBody(body, messageFormat, contentType) {
  if (typeof body !== "string") return body;

  const format = String(messageFormat || "").toLowerCase();
  const type = String(contentType || "").toLowerCase();
  const shouldParseJson =
    format === "json" || (!format && type.includes("json"));
  const shouldSendXml = format === "xml" || (!format && type.includes("xml"));
  const shouldSendText =
    format === "text" || (!format && type.includes("text/plain"));

  if (shouldParseJson) {
    const text = body.trim();
    if (!text) return "";
    try {
      return JSON.parse(text);
    } catch {
      throw Object.assign(
        new Error(
          "Message Body must be valid JSON when Message Format is JSON.",
        ),
        { status: 400 },
      );
    }
  }

  if (shouldSendXml) {
    let xml = body.replace(/^\uFEFF/, "");

    // Accept XML that was accidentally pasted as a JSON-quoted string and
    // normalize it back to the original XML document before sending.
    const trimmed = xml.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      try {
        const decoded = JSON.parse(trimmed);
        if (typeof decoded === "string") xml = decoded.replace(/^\uFEFF/, "");
      } catch {
        // Keep the original value; the XML validation below will report a
        // clearer error to the user.
      }
    }

    if (!xml.trimStart().startsWith("<")) {
      throw Object.assign(
        new Error(
          'Message Body must contain raw XML and start with "<" when Message Format is XML.',
        ),
        { status: 400 },
      );
    }

    // Buffer forces an AMQP data/binary body. This is important for consumers
    // that parse ProcessMessageEventArgs.Message.Body.ToArray() directly as
    // UTF-8 XML. Sending a JavaScript string can be encoded as an AMQP value
    // and may appear to those consumers as a quoted/escaped string.
    return Buffer.from(xml, "utf8");
  }

  if (shouldSendText) return Buffer.from(body.replace(/^\uFEFF/, ""), "utf8");

  return body;
}

async function testConnection(connectionString) {
  const { ServiceBusAdministrationClient } = loadSdk();
  const client = new ServiceBusAdministrationClient(connectionString);
  const iterator = client.listQueues();
  await iterator.next();
  return true;
}

async function listEntities(connectionString) {
  const { ServiceBusAdministrationClient } = loadSdk();
  const client = new ServiceBusAdministrationClient(connectionString);
  const queues = [];
  const topics = [];
  for await (const item of client.listQueues()) {
    let runtime = {};
    try {
      runtime = await client.getQueueRuntimeProperties(item.name);
    } catch (_) {}
    queues.push({
      name: item.name,
      status: item.status || "Active",
      lockDuration: item.lockDuration || null,
      defaultMessageTimeToLive: item.defaultMessageTimeToLive || null,
      maxDeliveryCount: item.maxDeliveryCount ?? null,
      requiresSession: Boolean(item.requiresSession),
      requiresDuplicateDetection: Boolean(item.requiresDuplicateDetection),
      activeMessageCount: runtime.activeMessageCount ?? 0,
      deadLetterMessageCount: runtime.deadLetterMessageCount ?? 0,
      scheduledMessageCount: runtime.scheduledMessageCount ?? 0,
      transferMessageCount: runtime.transferMessageCount ?? 0,
      transferDeadLetterMessageCount:
        runtime.transferDeadLetterMessageCount ?? 0,
      totalMessageCount: runtime.totalMessageCount ?? 0,
    });
  }
  for await (const item of client.listTopics()) {
    topics.push({
      name: item.name,
      status: item.status || "Active",
      defaultMessageTimeToLive: item.defaultMessageTimeToLive || null,
      requiresDuplicateDetection: Boolean(item.requiresDuplicateDetection),
      subscriptionCount: item.subscriptionCount ?? null,
    });
  }
  return { queues, topics };
}

async function sendMessage(
  connectionString,
  destinationType,
  destination,
  message,
) {
  const { ServiceBusClient } = loadSdk();
  const client = new ServiceBusClient(connectionString);
  const sender = client.createSender(destination);
  try {
    const payload = {
      body: normalizeMessageBody(
        message.body,
        message.messageFormat,
        message.contentType,
      ),
      contentType: message.contentType || "application/json",
      applicationProperties: message.applicationProperties || undefined,
      messageId: message.messageId || crypto.randomUUID(),
      correlationId: message.correlationId || undefined,
      subject: message.subject || undefined,
    };
    await sender.sendMessages(payload);
    return {
      destinationType,
      destination,
      messageId: payload.messageId || null,
      correlationId: payload.correlationId || null,
    };
  } finally {
    await sender.close().catch(() => {});
    await client.close().catch(() => {});
  }
}

async function peekMessages(connectionString, queueName, maxCount = 10) {
  const { ServiceBusClient } = loadSdk();
  const client = new ServiceBusClient(connectionString);
  const receiver = client.createReceiver(queueName);
  try {
    const messages = await receiver.peekMessages(
      Math.min(Math.max(Number(maxCount) || 10, 1), 50),
    );
    return messages.map((message) => ({
      messageId: message.messageId ?? null,
      correlationId: message.correlationId ?? null,
      subject: message.subject ?? null,
      contentType: message.contentType ?? null,
      enqueuedTimeUtc: message.enqueuedTimeUtc ?? null,
      sequenceNumber: message.sequenceNumber?.toString?.() ?? null,
      applicationProperties: message.applicationProperties || {},
      body: Buffer.isBuffer(message.body)
        ? message.body.toString("utf8")
        : message.body,
    }));
  } finally {
    await receiver.close().catch(() => {});
    await client.close().catch(() => {});
  }
}

async function listSubscriptions(connectionString, topicName) {
  const { ServiceBusAdministrationClient } = loadSdk();
  const client = new ServiceBusAdministrationClient(connectionString);
  const subscriptions = [];
  for await (const item of client.listSubscriptions(topicName)) {
    subscriptions.push({ name: item.subscriptionName || item.name });
  }
  return subscriptions;
}

function publicMessage(message, subscription) {
  return {
    subscription: subscription || null,
    messageId: message.messageId ?? null,
    correlationId: message.correlationId ?? null,
    subject: message.subject ?? null,
    contentType: message.contentType ?? null,
    enqueuedTimeUtc: message.enqueuedTimeUtc ?? null,
    sequenceNumber: message.sequenceNumber?.toString?.() ?? null,
    deadLetterReason: message.deadLetterReason ?? null,
    deadLetterErrorDescription: message.deadLetterErrorDescription ?? null,
    applicationProperties: message.applicationProperties || {},
    body: Buffer.isBuffer(message.body)
      ? message.body.toString("utf8")
      : message.body,
  };
}

async function peekDeadLetters(
  connectionString,
  destinationType,
  destination,
  subscriptionName,
  maxCount = 50,
) {
  const { ServiceBusClient } = loadSdk();
  const client = new ServiceBusClient(connectionString);
  const count = Math.min(Math.max(Number(maxCount) || 50, 1), 100);
  const receivers = [];
  try {
    if (destinationType === "queue") {
      receivers.push({
        name: null,
        receiver: client.createReceiver(destination, {
          subQueueType: "deadLetter",
        }),
      });
    } else {
      const names = subscriptionName
        ? [subscriptionName]
        : (await listSubscriptions(connectionString, destination))
            .map((x) => x.name)
            .filter(Boolean);
      for (const name of names)
        receivers.push({
          name,
          receiver: client.createReceiver(destination, name, {
            subQueueType: "deadLetter",
          }),
        });
    }
    const out = [];
    for (const item of receivers) {
      const messages = await item.receiver.peekMessages(count);
      out.push(...messages.map((m) => publicMessage(m, item.name)));
    }
    return out;
  } finally {
    await Promise.all(receivers.map((x) => x.receiver.close().catch(() => {})));
    await client.close().catch(() => {});
  }
}

async function getTopicDetails(connectionString, topicName) {
  const { ServiceBusAdministrationClient } = loadSdk();
  const client = new ServiceBusAdministrationClient(connectionString);
  const topic = await client.getTopic(topicName);
  const subscriptions = [];
  for await (const item of client.listSubscriptions(topicName)) {
    const name = item.subscriptionName || item.name;
    let runtime = {};
    try {
      runtime = await client.getSubscriptionRuntimeProperties(topicName, name);
    } catch (_) {}
    subscriptions.push({
      name,
      status: item.status || "Active",
      lockDuration: item.lockDuration || null,
      defaultMessageTimeToLive: item.defaultMessageTimeToLive || null,
      maxDeliveryCount: item.maxDeliveryCount ?? null,
      requiresSession: Boolean(item.requiresSession),
      activeMessageCount: runtime.activeMessageCount ?? 0,
      deadLetterMessageCount: runtime.deadLetterMessageCount ?? 0,
      totalMessageCount: runtime.totalMessageCount ?? 0,
    });
  }
  return {
    topic: {
      name: topic.name,
      status: topic.status || "Active",
      defaultMessageTimeToLive: topic.defaultMessageTimeToLive || null,
      requiresDuplicateDetection: Boolean(topic.requiresDuplicateDetection),
      subscriptionCount: subscriptions.length,
    },
    subscriptions,
  };
}

async function peekSubscriptionMessages(
  connectionString,
  topicName,
  subscriptionName,
  maxCount = 10,
) {
  const { ServiceBusClient } = loadSdk();
  const client = new ServiceBusClient(connectionString);
  const receiver = client.createReceiver(topicName, subscriptionName);
  try {
    const messages = await receiver.peekMessages(
      Math.min(Math.max(Number(maxCount) || 10, 1), 50),
    );
    return messages.map((message) => publicMessage(message, subscriptionName));
  } finally {
    await receiver.close().catch(() => {});
    await client.close().catch(() => {});
  }
}

async function checkDeadLetterByMessageId(
  connectionString,
  destinationType,
  destination,
  subscriptionName,
  messageId,
  maxCount = 100,
) {
  const messages = await peekDeadLetters(
    connectionString,
    destinationType,
    destination,
    subscriptionName,
    maxCount,
  );
  const target = String(messageId || "");
  return {
    found: messages.some((m) => String(m.messageId ?? "") === target),
    message: messages.find((m) => String(m.messageId ?? "") === target) || null,
    checkedCount: messages.length,
  };
}

module.exports = {
  testConnection,
  listEntities,
  listSubscriptions,
  getTopicDetails,
  sendMessage,
  peekMessages,
  peekSubscriptionMessages,
  peekDeadLetters,
  checkDeadLetterByMessageId,
};
