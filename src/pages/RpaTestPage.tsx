import { useState } from "react";

export default function RpaTestPage() {
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("IT");
  const [active, setActive] = useState(false);
  const [result, setResult] = useState("");

  return (
    <main className="rpa-test-page">
      <section className="rpa-test-card">
        <div>
          <span className="rpa-test-kicker">Browser RPA regression page</span>
          <h1>RPA Browser Test</h1>
          <p>
            A stable local page for testing selectors, form interaction, reading
            values, attributes, downloads, and screenshots.
          </p>
        </div>

        <label>
          Employee Name
          <input
            id="rpa-employee-name"
            name="employeeName"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Department
          <select
            id="rpa-department"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
          >
            <option value="IT">Information Technology</option>
            <option value="HR">Human Resources</option>
            <option value="FIN">Finance</option>
          </select>
        </label>
        <label className="rpa-test-check">
          <input
            id="rpa-active"
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
          />
          Active employee
        </label>
        <button
          id="rpa-submit"
          type="button"
          onClick={() =>
            setResult(
              `Employee: ${name || "(empty)"} | Department: ${department} | Active: ${active ? "Yes" : "No"}`,
            )
          }
        >
          Submit Test
        </button>

        {result && (
          <output id="rpa-result" className="rpa-test-result">
            {result}
          </output>
        )}

        <a
          id="rpa-attribute-link"
          data-test-value="RPA-ATTRIBUTE-001"
          href="data:text/plain;charset=utf-8,RPA%20download%20test"
          download="rpa-test.txt"
        >
          Download Test File
        </a>
      </section>
    </main>
  );
}
