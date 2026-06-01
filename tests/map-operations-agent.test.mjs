import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importTsModule(relativePath) {
  const source = await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    }
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
  return import(moduleUrl);
}

const agent = await importTsModule("lib/mapOperationsAgent.ts");

function employee(id, fullName, department, active = true) {
  return {
    id,
    full_name: fullName,
    position: "Planner",
    department,
    phone_extension: "1234",
    avatar_url: null,
    active,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  };
}

function seat(id, label, status, zone, employeeRecord = null) {
  return {
    id,
    seat_key: label.toLowerCase(),
    label,
    x: 0.2,
    y: 0.3,
    status,
    layer: "draft",
    employee_id: employeeRecord?.id ?? null,
    zone,
    department: null,
    notes: null,
    is_custom: false,
    employee: employeeRecord,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  };
}

const alice = employee("emp-alice", "Alice Adams", "Ops");
const bob = employee("emp-bob", "Bob Brown", "Ops");
const cara = employee("emp-cara", "Cara Chen", "Finance");
const inactive = employee("emp-inactive", "Inactive Person", "Ops", false);

function baseContext() {
  return agent.createMapOperationsContext({
    employees: [alice, bob, cara, inactive],
    seats: [
      seat("seat-n01", "N01", "available", "North Pod"),
      seat("seat-n02", "N02", "assigned", "North Pod", alice),
      seat("seat-s01", "S01", "reserved", "South Pod"),
      seat("seat-s02", "S02", "unavailable", "South Pod")
    ],
    departmentOptions: [{ id: "dep-ops", name: "Ops", active: true, created_at: "", updated_at: "" }],
    zoneOptions: [{ id: "zone-north", name: "North Pod", active: true, created_at: "", updated_at: "" }]
  });
}

function askPlannerPayload(overrides = {}) {
  return {
    question: "Which seats are open in North Pod?",
    employees: [alice, bob, cara],
    seats: [
      seat("seat-n01", "N01", "available", "North Pod"),
      seat("seat-n02", "N02", "assigned", "North Pod", alice)
    ],
    departmentOptions: [{ id: "dep-ops", name: "Ops", active: true, created_at: "", updated_at: "" }],
    zoneOptions: [{ id: "zone-north", name: "North Pod", active: true, created_at: "", updated_at: "" }],
    ...overrides
  };
}

function broadOpenPayload(question = "Which seats are open?") {
  return askPlannerPayload({
    question,
    employees: [alice, bob, cara],
    seats: [
      seat("seat-center-01", "C01", "available", "Center Desks"),
      seat("seat-center-02", "C02", "available", "Center Desks"),
      seat("seat-north-01", "N01", "available", "North Pod"),
      seat("seat-east-01", "E01", "available", "East Pod"),
      seat("seat-east-02", "E02", "assigned", "East Pod", alice),
      seat("seat-west-01", "W01", "reserved", "West Pod")
    ],
    zoneOptions: [
      { id: "zone-center", name: "Center Desks", active: true, created_at: "", updated_at: "" },
      { id: "zone-north", name: "North Pod", active: true, created_at: "", updated_at: "" },
      { id: "zone-east", name: "East Pod", active: true, created_at: "", updated_at: "" }
    ]
  });
}

function openAIResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function toolResponse(id, calls) {
  return openAIResponse({
    id,
    output: calls.map(call => ({
      type: "function_call",
      name: call.name,
      call_id: call.callId,
      arguments: JSON.stringify(call.arguments ?? {})
    }))
  });
}

function plannerResponsePayload(overrides = {}) {
  return {
    status: "answered",
    answer: "North Pod has one open seat.",
    summary: "Open seat found.",
    confidence: "high",
    highlights: [{ seatId: "seat-n01", label: "N01", reason: "Available in North Pod." }],
    warnings: [],
    followUps: [],
    ...overrides
  };
}

function finalResponse(answerOrOverrides = "North Pod has one open seat.") {
  const payload = typeof answerOrOverrides === "string"
    ? plannerResponsePayload({ answer: answerOrOverrides })
    : plannerResponsePayload(answerOrOverrides);

  return openAIResponse({
    id: "resp-final",
    output: [{
      type: "message",
      content: [{
        type: "output_text",
        text: JSON.stringify(payload)
      }]
    }]
  });
}

function fencedFinalResponse(overrides = {}) {
  return openAIResponse({
    id: "resp-final-fenced",
    output: [{
      type: "message",
      content: [{
        type: "output_text",
        text: `Here is the structured answer:\n\n\`\`\`json\n${JSON.stringify(plannerResponsePayload(overrides))}\n\`\`\``
      }]
    }]
  });
}

async function withMockedOpenAI(responses, callback) {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_MODEL;
  const requests = [];

  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    const response = responses[Math.min(requests.length - 1, responses.length - 1)];
    return typeof response === "function" ? response(requests[requests.length - 1]) : response;
  };
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_MODEL = "gpt-test";

  try {
    return await callback(requests);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
    if (originalModel === undefined) {
      delete process.env.OPENAI_MODEL;
    } else {
      process.env.OPENAI_MODEL = originalModel;
    }
  }
}

async function withOpenAIDisabled(callback) {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_MODEL;

  globalThis.fetch = async () => {
    assert.fail("Broad open-seat shortcut should not call OpenAI");
  };
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;

  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
    if (originalModel === undefined) {
      delete process.env.OPENAI_MODEL;
    } else {
      process.env.OPENAI_MODEL = originalModel;
    }
  }
}

test("map summary counts seats by status, zone, and department", () => {
  const summary = agent.runReadOnlyPlannerTool(baseContext(), "get_map_summary", {});

  assert.equal(summary.totals.total, 4);
  assert.equal(summary.totals.assigned, 1);
  assert.equal(summary.totals.available, 1);
  assert.equal(summary.totals.reserved, 1);
  assert.equal(summary.totals.unavailable, 1);
  assert.equal(summary.totals.activeEmployees, 3);
  assert.equal(summary.totals.unassignedActiveEmployees, 2);

  const north = summary.byZone.find(item => item.name === "North Pod");
  assert.equal(north.total, 2);
  assert.equal(north.assigned, 1);

  const ops = summary.byDepartment.find(item => item.name === "Ops");
  assert.equal(ops.activeEmployees, 2);
  assert.equal(ops.assignedSeats, 1);
  assert.equal(ops.unassignedEmployees, 1);
});

test("seat search filters by zone, status, occupancy, and caps results", () => {
  const result = agent.runReadOnlyPlannerTool(baseContext(), "search_seats", {
    zone: "North Pod",
    status: "available",
    occupied: false,
    query: "",
    department: "",
    customOnly: null,
    limit: 10
  });

  assert.equal(result.count, 1);
  assert.equal(result.seats[0].label, "N01");

  const personResult = agent.runReadOnlyPlannerTool(baseContext(), "search_seats", {
    query: "Alice",
    status: "all",
    zone: "",
    department: "",
    occupied: null,
    customOnly: null,
    limit: 1
  });

  assert.equal(personResult.count, 1);
  assert.equal(personResult.seats[0].label, "N02");
});

test("list people reports assigned and unassigned active employees", () => {
  const unassigned = agent.runReadOnlyPlannerTool(baseContext(), "list_people", {
    assignment: "unassigned",
    department: "",
    query: "",
    limit: 10
  });

  assert.equal(unassigned.count, 2);
  assert.deepEqual(unassigned.people.map(person => person.fullName).sort(), ["Bob Brown", "Cara Chen"]);
});

test("read-only tool outputs exclude nonessential phone extensions and seat notes", () => {
  const context = agent.createMapOperationsContext({
    employees: [alice],
    seats: [{ ...seat("seat-note", "N03", "assigned", "North Pod", alice), notes: "Private note" }]
  });

  const seatResult = agent.runReadOnlyPlannerTool(context, "search_seats", {
    query: "",
    status: "all",
    zone: "",
    department: "",
    occupied: null,
    customOnly: null,
    limit: 10
  });
  const peopleResult = agent.runReadOnlyPlannerTool(context, "list_people", {
    assignment: "all",
    department: "",
    query: "",
    limit: 10
  });

  assert.equal("phoneExtension" in seatResult.seats[0], false);
  assert.equal("notes" in seatResult.seats[0], false);
  assert.equal("phoneExtension" in peopleResult.people[0], false);
});

test("map health flags deterministic data quality issues", () => {
  const dupeAlice = employee("emp-alice-copy", "Alice Adams", "Ops");
  const unhealthyContext = agent.createMapOperationsContext({
    employees: [alice, bob, dupeAlice],
    seats: [
      { ...seat("bad-assigned", "B01", "assigned", "North Pod"), employee_id: null, employee: null },
      seat("bad-status", "B02", "reserved", "North Pod", alice),
      seat("dupe-label-a", "D01", "available", null),
      seat("dupe-label-b", "D01", "assigned", null, alice)
    ]
  });

  const health = agent.runReadOnlyPlannerTool(unhealthyContext, "get_map_health", {});
  const codes = health.issues.map(issue => issue.code);

  assert.ok(codes.includes("assigned_status_without_employee"));
  assert.ok(codes.includes("employee_with_non_assigned_status"));
  assert.ok(codes.includes("employee_assigned_to_multiple_seats"));
  assert.ok(codes.includes("missing_zone"));
  assert.ok(codes.includes("duplicate_seat_label"));
  assert.ok(codes.includes("duplicate_employee_name"));
  assert.ok(codes.includes("unassigned_active_employees"));
});

test("planner response validation removes unknown highlights and normalizes labels", () => {
  const context = baseContext();
  const response = agent.validateAskPlannerResponse({
    status: "answered",
    answer: "North Pod has one open seat.",
    summary: "Open seat found.",
    confidence: "high",
    highlights: [
      { seatId: "seat-n01", label: "Wrong", reason: "Available in North Pod." },
      { seatId: "missing-seat", label: "Missing", reason: "Should be removed." }
    ],
    warnings: ["Limited to draft data."],
    followUps: ["Show all reserved seats"]
  }, context.seats);

  assert.equal(response.highlights.length, 1);
  assert.equal(response.highlights[0].seatId, "seat-n01");
  assert.equal(response.highlights[0].label, "N01");
});

test("planner response validation accepts broad answers with zero highlights", () => {
  const context = baseContext();
  const response = agent.validateAskPlannerResponse({
    status: "answered",
    answer: "There are multiple open seats across the saved draft map.",
    summary: "Broad open-seat summary.",
    confidence: "medium",
    highlights: [],
    warnings: ["No seats highlighted for this broad answer. Ask for a specific zone, department, or smaller group to highlight seats."],
    followUps: ["Which seats are open in North Pod?", "Which open seats are near Ops?"]
  }, context.seats);

  assert.equal(response.status, "answered");
  assert.equal(response.highlights.length, 0);
  assert.match(response.warnings[0], /broad answer/i);
  assert.deepEqual(response.followUps, ["Which seats are open in North Pod?", "Which open seats are near Ops?"]);
});

test("explain selected seat returns structured response without OpenAI and minimizes sensitive fields", async () => {
  const explainedSeat = {
    ...seat("seat-c03", "C03", "assigned", "Center Desks", alice),
    x: 0.5,
    y: 0.5,
    notes: "Private seat note"
  };
  const nearbySeat = { ...seat("seat-c04", "C04", "available", "Center Desks"), x: 0.52, y: 0.51 };
  const fartherSeat = { ...seat("seat-c05", "C05", "reserved", "Center Desks"), x: 0.7, y: 0.7 };

  await withOpenAIDisabled(async () => {
    const result = await agent.answerMapOperationsQuestion(askPlannerPayload({
      question: "Explain seat C03",
      seatId: "seat-c03",
      employees: [alice],
      seats: [explainedSeat, nearbySeat, fartherSeat],
      zoneOptions: [{ id: "zone-center", name: "Center Desks", active: true, created_at: "", updated_at: "" }]
    }));

    assert.equal(result.status, "answered");
    assert.equal(result.confidence, "high");
    assert.deepEqual(result.highlights, [{
      seatId: "seat-c03",
      label: "C03",
      reason: "Selected seat explained by Ask Planner."
    }]);
    assert.match(result.answer, /Seat C03 has draft seat ID seat-c03/);
    assert.match(result.answer, /Location: Center Desks/);
    assert.match(result.answer, /Status: assigned/);
    assert.match(result.answer, /Assignment: Alice Adams \/ Planner \/ Ops/);
    assert.match(result.answer, /Nearby on the map in Center Desks: C04 \(available\), C05 \(reserved\)/);
    assert.ok(result.followUps.includes("Open seats in Center Desks"));
    assert.ok(result.followUps.includes("What looks unhealthy?"));
    assert.doesNotMatch(result.answer, /1234|Private seat note|Ext\./);
  });
});

test("explain seat can fall back to exact label when no seatId is supplied", async () => {
  await withOpenAIDisabled(async () => {
    const result = await agent.answerMapOperationsQuestion(askPlannerPayload({
      question: "Explain seat N01",
      seatId: null
    }));

    assert.equal(result.status, "answered");
    assert.equal(result.highlights[0].seatId, "seat-n01");
    assert.match(result.answer, /Seat N01/);
  });
});

test("explain selected seat includes seat-specific map health warnings", async () => {
  const unhealthySeat = { ...seat("seat-bad", "B01", "assigned", "North Pod"), employee_id: null, employee: null };

  await withOpenAIDisabled(async () => {
    const result = await agent.answerMapOperationsQuestion(askPlannerPayload({
      question: "Explain seat B01",
      seatId: "seat-bad",
      seats: [unhealthySeat]
    }));

    assert.equal(result.status, "answered");
    assert.equal(result.highlights[0].seatId, "seat-bad");
    assert.match(result.answer, /Map health warnings for this seat/);
    assert.match(result.warnings[0], /assigned status but no employee/);
  });
});

test("explain selected seat reports stale or missing draft seats safely", async () => {
  await withOpenAIDisabled(async () => {
    await assert.rejects(
      () => agent.answerMapOperationsQuestion(askPlannerPayload({
        question: "Explain seat Missing",
        seatId: "missing-seat"
      })),
      error => {
        assert.match(error.message, /could not find that seat in saved draft data/i);
        assert.doesNotMatch(error.message, /OPENAI_API_KEY|Bearer|Authorization/);
        return true;
      }
    );
  });
});

test("broad open-seat shortcut returns a structured response without OpenAI", async () => {
  await withOpenAIDisabled(async () => {
    const result = await agent.answerMapOperationsQuestion(broadOpenPayload("Which seats are open?"));

    assert.equal(result.status, "answered");
    assert.equal(result.confidence, "high");
    assert.match(result.answer, /4 open seats/i);
    assert.match(result.answer, /Center Desks \(2\)/);
    assert.match(result.answer, /North Pod \(1\)/);
    assert.match(result.answer, /East Pod \(1\)/);
    assert.match(result.summary, /4 open seats across 3 zones/i);
    assert.deepEqual(result.highlights, []);
    assert.match(result.warnings[0], /No seats highlighted for this broad answer/i);
    assert.ok(result.followUps.includes("Open seats in Center Desks"));
    assert.ok(result.followUps.includes("Open seats in North Pod"));
    assert.ok(result.followUps.includes("Open seats in East Pod"));
  });
});

test("broad open and available prompt synonyms use the deterministic shortcut", async () => {
  const prompts = [
    "What seats are open?",
    "Show open seats",
    "Which seats are available?",
    "Show available seats",
    "List all available desks"
  ];

  await withOpenAIDisabled(async () => {
    for (const prompt of prompts) {
      assert.equal(agent.isBroadOpenSeatQuestion(prompt), true, `${prompt} should be treated as broad`);
      const result = await agent.answerMapOperationsQuestion(broadOpenPayload(prompt));

      assert.equal(result.status, "answered");
      assert.equal(result.highlights.length, 0);
      assert.match(result.answer, /open seats/i);
      assert.match(result.warnings[0], /broad answer/i);
    }
  });
});

test("narrow open-seat prompts still use the OpenAI path and validate highlights", async () => {
  await withMockedOpenAI([
    toolResponse("resp-narrow-open-tools", [
      {
        name: "search_seats",
        callId: "call_narrow_open",
        arguments: { query: "", status: "available", zone: "Center Desks", department: "", occupied: false, customOnly: null, limit: 10 }
      }
    ]),
    finalResponse({
      answer: "Center Desks has two open seats.",
      summary: "Open seats found in Center Desks.",
      confidence: "high",
      highlights: [{ seatId: "seat-center-01", label: "C01", reason: "Available in Center Desks." }],
      warnings: [],
      followUps: ["Show open seats in North Pod"]
    })
  ], async requests => {
    const result = await agent.answerMapOperationsQuestion(broadOpenPayload("Open seats in Center Desks"));

    assert.equal(agent.isBroadOpenSeatQuestion("Open seats in Center Desks"), false);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].previous_response_id, "resp-narrow-open-tools");
    assert.equal(result.highlights.length, 1);
    assert.equal(result.highlights[0].seatId, "seat-center-01");
    assert.equal(result.highlights[0].label, "C01");
  });
});

test("map health prompt uses the read-only OpenAI path", async () => {
  await withMockedOpenAI([
    toolResponse("resp-health-tools", [
      { name: "get_map_health", callId: "call_health" }
    ]),
    finalResponse({
      answer: "The saved draft map has one health warning to review.",
      summary: "Map health checked.",
      confidence: "high",
      highlights: [],
      warnings: ["One active employee is unassigned."],
      followUps: ["Show unassigned employees"]
    })
  ], async requests => {
    const result = await agent.answerMapOperationsQuestion(askPlannerPayload({ question: "What looks unhealthy?" }));

    assert.equal(requests.length, 2);
    assert.equal(requests[1].previous_response_id, "resp-health-tools");
    assert.equal(requests[1].input[0].call_id, "call_health");
    assert.equal(result.status, "answered");
    assert.match(result.answer, /health warning/i);
    assert.equal(result.highlights.length, 0);
  });
});

test("write prompts are refused through the read-only path without mutating input data", async () => {
  const payload = askPlannerPayload({ question: "Move Alice to N01" });
  const before = JSON.stringify({ seats: payload.seats, employees: payload.employees });

  await withMockedOpenAI([
    finalResponse({
      status: "refused",
      answer: "I cannot move seats or change assignments. I can only provide read-only findings from the saved draft map.",
      summary: "Write action refused.",
      confidence: "high",
      highlights: [],
      warnings: ["Ask Planner is read-only."],
      followUps: ["Which seats are open?"]
    })
  ], async requests => {
    const result = await agent.answerMapOperationsQuestion(payload);

    assert.equal(requests.length, 1);
    assert.match(requests[0].input, /may request a write action/i);
    assert.equal(result.status, "refused");
    assert.match(result.answer, /cannot move seats/i);
    assert.equal(JSON.stringify({ seats: payload.seats, employees: payload.employees }), before);
  });
});

test("planner model resolution keeps OPENAI_MODEL optional with a single default", () => {
  assert.equal(agent.ASK_PLANNER_DEFAULT_MODEL, "gpt-5.5");
  assert.equal(agent.resolveAskPlannerModel({}), agent.ASK_PLANNER_DEFAULT_MODEL);
  assert.equal(agent.resolveAskPlannerModel({ OPENAI_MODEL: "  gpt-custom  " }), "gpt-custom");
});

test("OpenAI model access errors are friendly and do not expose raw API payloads", () => {
  const unavailable = agent.formatOpenAIAdminError(400, {
    error: {
      message: "The model `gpt-missing` does not exist or you do not have access to it.",
      code: "model_not_found",
      param: "model"
    }
  }, "gpt-missing");

  assert.match(unavailable, /cannot use the configured OpenAI model "gpt-missing"/);
  assert.match(unavailable, /OPENAI_MODEL/);
  assert.doesNotMatch(unavailable, /model_not_found/);
  assert.doesNotMatch(unavailable, /does not exist/);

  const unauthorized = agent.formatOpenAIAdminError(403, {
    error: {
      message: "Project does not have access.",
      code: "permission_denied"
    }
  }, "gpt-private");

  assert.match(unauthorized, /cannot use the configured OpenAI model "gpt-private"/);
});

test("missing OpenAI configuration error is sanitized and production-actionable", async () => {
  await withOpenAIDisabled(async () => {
    await assert.rejects(
      () => agent.answerMapOperationsQuestion(askPlannerPayload({ question: "What looks unhealthy?" })),
      error => {
        assert.match(error.message, /not configured for this environment/i);
        assert.match(error.message, /OPENAI_API_KEY/);
        assert.match(error.message, /server-side environment variable/i);
        assert.match(error.message, /redeploy/i);
        assert.doesNotMatch(error.message, /sk-|Bearer|Authorization/);
        return true;
      }
    );
  });
});

test("OpenAI rate-limit errors stay friendly and sanitized", () => {
  const rateLimited = agent.formatOpenAIAdminError(429, {
    error: {
      message: "Rate limit details with request payload should not surface.",
      code: "rate_limit_exceeded",
      type: "requests"
    }
  }, "gpt-test");

  assert.equal(rateLimited, "Ask Planner is temporarily rate limited by OpenAI. Try again shortly.");
  assert.doesNotMatch(rateLimited, /request payload|rate_limit_exceeded/);
});

test("OpenAI failure diagnostics keep only safe server-side fields", () => {
  const diagnostic = agent.buildOpenAIFailureDiagnostic({
    status: 403,
    statusText: "Forbidden",
    model: "gpt-private",
    requestId: "req_safe_123",
    payload: {
      error: {
        type: "invalid_request_error",
        code: "model_not_found",
        param: "model",
        message: "Authorization: Bearer sk-testSECRET12345 for jane@example.com failed; call 555-123-4567"
      }
    }
  });

  assert.deepEqual({
    status: diagnostic.status,
    statusText: diagnostic.statusText,
    errorType: diagnostic.errorType,
    errorCode: diagnostic.errorCode,
    errorParam: diagnostic.errorParam,
    model: diagnostic.model,
    requestId: diagnostic.requestId
  }, {
    status: 403,
    statusText: "Forbidden",
    errorType: "invalid_request_error",
    errorCode: "model_not_found",
    errorParam: "model",
    model: "gpt-private",
    requestId: "req_safe_123"
  });
  assert.match(diagnostic.errorMessage, /redacted-authorization/);
  assert.match(diagnostic.errorMessage, /redacted-email/);
  assert.match(diagnostic.errorMessage, /redacted-phone/);
  assert.doesNotMatch(diagnostic.errorMessage, /sk-testSECRET12345/);
  assert.doesNotMatch(diagnostic.errorMessage, /jane@example\.com/);
  assert.doesNotMatch(diagnostic.errorMessage, /555-123-4567/);
});

test("Responses loop returns a matching function_call_output for a single function call", async () => {
  await withMockedOpenAI([
    toolResponse("resp-tools", [
      {
        name: "search_seats",
        callId: "call_single",
        arguments: { query: "", status: "available", zone: "North Pod", department: "", occupied: false, customOnly: null, limit: 10 }
      }
    ]),
    finalResponse()
  ], async requests => {
    const result = await agent.answerMapOperationsQuestion(askPlannerPayload());

    assert.equal(result.status, "answered");
    assert.equal(requests.length, 2);
    assert.ok(requests[0].instructions.includes("Your final answer must be one JSON object"));
    assert.equal(requests[0].text.format.name, "ask_planner_response");
    assert.ok(requests[1].instructions.includes("Your final answer must be one JSON object"));
    assert.equal(requests[1].text.format.name, "ask_planner_response");
    assert.equal(requests[1].previous_response_id, "resp-tools");
    assert.deepEqual(requests[1].input.map(item => item.call_id), ["call_single"]);
    assert.equal(requests[1].input[0].type, "function_call_output");
    assert.equal(typeof requests[1].input[0].output, "string");
    assert.equal(JSON.parse(requests[1].input[0].output).seats[0].id, "seat-n01");
  });
});

test("Scoped OpenAI open-seat response parses with zero highlights and no parse error", async () => {
  await withMockedOpenAI([
    toolResponse("resp-broad-open-tools", [
      {
        name: "search_seats",
        callId: "call_broad_open",
        arguments: { query: "", status: "available", zone: "", department: "", occupied: false, customOnly: null, limit: 30 }
      }
    ]),
    finalResponse({
      answer: "The saved draft map has open seats across multiple areas.",
      summary: "Open seats are available; narrow by zone or department for map highlights.",
      confidence: "medium",
      highlights: [],
      warnings: ["No seats highlighted for this broad answer. Ask for a specific zone, department, or smaller group to highlight seats."],
      followUps: ["Which seats are open in North Pod?", "Which seats are open in South Pod?"]
    })
  ], async requests => {
    const result = await agent.answerMapOperationsQuestion(askPlannerPayload({ question: "Which open seats are near Ops?" }));

    assert.equal(result.status, "answered");
    assert.equal(result.highlights.length, 0);
    assert.match(result.summary, /narrow by zone/i);
    assert.match(result.warnings[0], /broad answer/i);
    assert.ok(result.followUps.includes("Which seats are open in North Pod?"));
    assert.equal(requests.length, 2);
    assert.equal(requests[1].previous_response_id, "resp-broad-open-tools");
  });
});

test("JSON response wrapped in a code fence parses as a structured Ask Planner response", async () => {
  await withMockedOpenAI([
    toolResponse("resp-fenced-tools", [
      {
        name: "search_seats",
        callId: "call_fenced_open",
        arguments: { query: "", status: "available", zone: "", department: "", occupied: false, customOnly: null, limit: 30 }
      }
    ]),
    fencedFinalResponse({
      answer: "There is one open seat in the saved draft data.",
      summary: "Code-fenced JSON was recovered safely.",
      highlights: [],
      warnings: ["No seats highlighted for this broad answer."],
      followUps: ["Open seats in North Pod"]
    })
  ], async () => {
    const result = await agent.answerMapOperationsQuestion(askPlannerPayload({ question: "Which open seats are near Ops?" }));

    assert.equal(result.status, "answered");
    assert.equal(result.highlights.length, 0);
    assert.equal(result.summary, "Code-fenced JSON was recovered safely.");
  });
});

test("Responses loop returns outputs for every function call in one response", async () => {
  await withMockedOpenAI([
    toolResponse("resp-many-tools", [
      { name: "get_map_summary", callId: "call_summary" },
      {
        name: "search_seats",
        callId: "call_search",
        arguments: { query: "", status: "available", zone: "North Pod", department: "", occupied: false, customOnly: null, limit: 10 }
      },
      { name: "get_map_health", callId: "call_health" },
      { name: "list_people", callId: "call_people", arguments: { query: "", department: "", assignment: "unassigned", limit: 10 } },
      { name: "get_zone_department_breakdown", callId: "call_breakdown" }
    ]),
    finalResponse()
  ], async requests => {
    await agent.answerMapOperationsQuestion(askPlannerPayload());

    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1].input.map(item => item.call_id), [
      "call_summary",
      "call_search",
      "call_health",
      "call_people",
      "call_breakdown"
    ]);
    requests[1].input.forEach(item => {
      assert.equal(item.type, "function_call_output");
      assert.equal(typeof item.output, "string");
    });
  });
});

test("Responses loop returns a safe output for an unknown tool", async () => {
  await withMockedOpenAI([
    toolResponse("resp-unknown-tool", [
      { name: "publish_map", callId: "call_unknown", arguments: { unsafe: true } }
    ]),
    finalResponse("I cannot publish from Ask Planner.")
  ], async requests => {
    await agent.answerMapOperationsQuestion(askPlannerPayload({ question: "Publish the map" }));
    const output = JSON.parse(requests[1].input[0].output);

    assert.equal(requests[1].input[0].call_id, "call_unknown");
    assert.match(output.error, /Unknown read-only tool/);
  });
});

test("Responses loop returns a safe output when a read-only tool throws", () => {
  const output = agent.buildFunctionCallOutput(
    baseContext(),
    { name: "search_seats", callId: "call_throw", argumentsText: "{}" },
    () => {
      throw new Error("Private tool detail with 555-123-4567");
    }
  );

  assert.equal(output.type, "function_call_output");
  assert.equal(output.call_id, "call_throw");
  assert.equal(typeof output.output, "string");
  assert.deepEqual(JSON.parse(output.output), {
    error: "Read-only tool failed. Ask Planner can continue with other available read-only data."
  });
  assert.doesNotMatch(output.output, /555-123-4567/);
});

test("Responses loop stops after the final assistant message", async () => {
  await withMockedOpenAI([
    toolResponse("resp-tools", [{ name: "get_map_summary", callId: "call_summary" }]),
    finalResponse("Final answer after one lookup."),
    toolResponse("resp-extra", [{ name: "get_map_health", callId: "call_extra" }])
  ], async requests => {
    const result = await agent.answerMapOperationsQuestion(askPlannerPayload());

    assert.equal(result.answer, "Final answer after one lookup.");
    assert.equal(requests.length, 2);
  });
});

test("Responses loop cap produces a friendly sanitized error", async () => {
  await withMockedOpenAI([
    toolResponse("resp-loop-1", [{ name: "get_map_summary", callId: "call_1" }]),
    toolResponse("resp-loop-2", [{ name: "get_map_summary", callId: "call_2" }]),
    toolResponse("resp-loop-3", [{ name: "get_map_summary", callId: "call_3" }]),
    toolResponse("resp-loop-4", [{ name: "get_map_summary", callId: "call_4" }]),
    toolResponse("resp-loop-5", [{ name: "get_map_summary", callId: "call_5" }])
  ], async requests => {
    await assert.rejects(
      () => agent.answerMapOperationsQuestion(askPlannerPayload()),
      error => {
        assert.match(error.message, /needed too many read-only lookups/i);
        assert.doesNotMatch(error.message, /test-openai-key|Authorization|Bearer|seat-n01|Alice Adams|1234/);
        return true;
      }
    );
    assert.equal(requests.length, 5);
  });
});

test("askPlannerAction remains read-only at the source level", async () => {
  const source = await readFile(new URL("../app/actions.ts", import.meta.url), "utf8");
  const match = source.match(/export async function askPlannerAction[\s\S]+?\n}\r?\n\r?\nfunction buildSeatKey/);
  assert.ok(match, "askPlannerAction should appear before buildSeatKey");

  const actionSource = match[0];
  assert.doesNotMatch(actionSource, /\.(?:insert|update|upsert|delete|rpc)\s*\(/);
  assert.doesNotMatch(actionSource, /revalidatePath/);
  assert.doesNotMatch(actionSource, /publishSeatMapAction/);
  assert.doesNotMatch(actionSource, /moveSeatAction|updateSeatAction|deleteSeatAction|restoreDraftSnapshotAction|swapSeatAssignmentsAction|importAssignmentsCsvAction/);
});

test("map operations agent helper has no Supabase write calls or publish hooks", async () => {
  const source = await readFile(new URL("../lib/mapOperationsAgent.ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, /\.(?:insert|update|upsert|delete|rpc)\s*\(/);
  assert.doesNotMatch(source, /revalidatePath/);
  assert.doesNotMatch(source, /publishSeatMapAction/);
  assert.match(source, /AbortController/);
  assert.match(source, /OPENAI_TIMEOUT_MS/);
});
