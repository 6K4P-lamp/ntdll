const textarea = document.getElementById("input-code");
const resultContainer = document.querySelector(".result-stack");
const runButton = document.getElementById("run-btn");
const stopButton = document.getElementById("stop-btn");
const resetButton = document.getElementById("reset-btn");

// llama.cpp server 주소
const BASE_URL = "http://127.0.0.1:8080";

// 현재 요청 AbortController
let currentController = null;

// 초기화 버튼으로 인한 abort인 경우 "중단됨" UI를 표시하지 않기 위한 플래그
let suppressAbortUi = false;

// ── llama.cpp 서버 연결 실패 안내 모달 ─────────────────────
let serverModalEl = null;

function ensureServerModal() {
    if (serverModalEl) return serverModalEl;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
    <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h3 id="modal-title">llama.cpp 서버에 연결할 수 없습니다</h3>

        <p>
            이 도구는 로컬에서 실행 중인 <strong>llama.cpp 서버</strong>
            (<code>${escapeHtml(BASE_URL)}</code>)와 통신해야 합니다.
            서버가 설치되어 있지 않거나 실행되어 있지 않은 것으로 보입니다.
        </p>

        <div class="modal-steps">
            <h4>설치 및 실행 방법</h4>
            <ol>
                <li>
                    <a href="https://github.com/ggml-org/llama.cpp" target="_blank" rel="noopener noreferrer">
                        llama.cpp 저장소
                    </a>에서 빌드하거나 release 바이너리를 다운로드합니다.
                </li>
                <li>사용할 GGUF 모델 파일을 준비합니다.</li>
                <li>
                    아래와 같이 OpenAI 호환 서버를 실행합니다:
                    <pre class="modal-code">llama-server -m model.gguf --port 8080</pre>
                </li>
                <li>서버가 실행되면 이 페이지를 새로고침하거나 다시 시도 버튼을 누릅니다.</li>
            </ol>
        </div>

        <div class="modal-actions">
            <button class="btn btn--primary" type="button" data-action="retry">다시 시도</button>
            <button class="btn btn--ghost" type="button" data-action="close">닫기</button>
        </div>
    </div>`;

    overlay.querySelector('[data-action="close"]').addEventListener("click", () => {
        hideServerModal();
    });

    overlay.querySelector('[data-action="retry"]').addEventListener("click", () => {
        hideServerModal();
        checkLlmServer();
    });

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
            hideServerModal();
        }
    });

    document.body.appendChild(overlay);

    serverModalEl = overlay;

    return overlay;
}

function showServerModal() {
    const overlay = ensureServerModal();

    overlay.classList.add("is-open");
}

function hideServerModal() {
    if (!serverModalEl) return;

    serverModalEl.classList.remove("is-open");
}

function isConnectionError(err) {
    // fetch가 서버에 접속조차 못한 경우 TypeError("Failed to fetch" 등)가 발생함
    return err instanceof TypeError;
}

// ── 서버 상태 확인 ────────────────────────────────────────
async function checkLlmServer() {
    try {
        const controller = new AbortController();

        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const response = await fetch(`${BASE_URL}/health`, {
            method: "GET",
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            showServerModal();
            return false;
        }

        hideServerModal();
        return true;

    } catch (err) {
        showServerModal();
        return false;
    }
}

// 페이지 로드 시 서버 상태 확인
window.addEventListener("DOMContentLoaded", () => {
    checkLlmServer();
});

// ── 공통 JSON fetch 래퍼 ────────────────────────────────────
async function callLlm(messages, systemContent, temperature = 0.1, signal = null) {
    let response;

    try {
        response = await fetch(`${BASE_URL}/v1/chat/completions`, {
            method: "POST",
            signal,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "*",
                messages: [
                    { role: "system", content: systemContent },
                    ...messages,
                ],
                temperature,
                response_format: { type: "json_object" },
            }),
        });
    } catch (err) {
        if (isConnectionError(err)) {
            showServerModal();
        }

        throw err;
    }

    if (!response.ok) {
        throw new Error(await response.text());
    }

    const data = await response.json();

    let content =
    data.choices?.[0]?.message?.content || "{}";

    // 코드블럭 제거
    content = content
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

    return JSON.parse(content);
}

// ── SSE 스트리밍 fetch 래퍼 ───────────────────────────────
async function streamLlm(
    messages,
    systemContent,
    {
        temperature = 0.1,
        onChunk = () => {},
        signal = null,
    } = {}
) {
    const response = await fetch(
        `${BASE_URL}/v1/chat/completions`,
        {
            method: "POST",
            signal,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "*",
                stream: true,
                messages: [
                    {
                        role: "system",
                        content: systemContent,
                    },
                    ...messages,
                ],
                temperature,
            }),
        }
    ).catch((err) => {
        if (isConnectionError(err)) {
            showServerModal();
        }

        throw err;
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    const reader = response.body.getReader();

    const decoder = new TextDecoder("utf-8");

    let buffer = "";
    let fullText = "";

    while (true) {
        const { value, done } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, {
            stream: true,
        });

        const lines = buffer.split("\n");

        buffer = lines.pop() || "";

        for (const line of lines) {
            const trimmed = line.trim();

            if (!trimmed.startsWith("data:")) {
                continue;
            }

            const data = trimmed.slice(5).trim();

            if (data === "[DONE]") {
                return fullText;
            }

            try {
                const json = JSON.parse(data);

                const token =
                json.choices?.[0]?.delta?.content || "";

                if (!token) continue;

                fullText += token;

                onChunk(token, fullText);

            } catch (err) {
                console.warn(
                    "SSE parse fail:",
                    err
                );
            }
        }
    }

    return fullText;
}

// ── 1단계: 매핑 + notes ──────────────────────────────────
async function fetchMapping(
    userInput,
    windowsVer,
    arch,
    signal
) {
    const system = `You are an expert Windows Native API engineer.
    Target: ${windowsVer} ${arch}, MSVC 19.3+

    Rules:
    - Map each WinAPI call to the corresponding Nt* function in ntdll.dll
    - If no direct mapping exists, state so in notes
    - Do NOT generate example code here
    - Return only valid JSON, no prose`;

    const prompt = `Map the following WinAPI function(s) or code to Native API (Nt*).

    YOU MUST RETURN ONLY VALID JSON with this exact schema:
    {
        "ntFunctions": ["NtCreateFile", "..."],
        "mapping": [
            {
                "winapi": "CreateFileW",
                "ntapi": "NtCreateFile",
                "description": "파일 생성 및 접근 처리"
            }
        ],
        "notes": ["NTSTATUS 반환", "..."]
    }

    User Input:
    ${userInput}`;

    return callLlm(
        [{ role: "user", content: prompt }],
        system,
        0.05,
        signal
    );
}

// ── cheatsheet 조회 ──────────────────────────────────────
function lookupCheatsheet(ntFunctions) {
    const cheatsheet = window.NT_CHEATSHEET;

    if (!cheatsheet) {
        return {
            found: [],
            missing: [],
        };
    }

    const found = [];
    const missing = [];

    for (const fn of ntFunctions) {
        const entry = cheatsheet.get(fn);

        if (entry) {
            found.push({
                name: fn,
                ...entry,
            });
        } else {
            missing.push(fn);
        }
    }

    return { found, missing };
}

function buildCheatsheetContext(found, missing) {
    if (
        found.length === 0 &&
        missing.length === 0
    ) {
        return "";
    }

    const sections = found
    .map((fn) => {
        const structList = fn.structures.length
        ? fn.structures
        .map((s) => `  - ${s}`)
        .join("\n")
        : "  (없음)";

        const noteList = fn.notes.length
        ? fn.notes
        .map((n) => `  - ${n}`)
        .join("\n")
        : "  (없음)";

        return `### ${fn.name}
        Signature:

        ${fn.signature}

        Structures:
        ${structList}

        Notes:
        ${noteList}`;
    })
    .join("\n\n");

    const missingNote = missing.length
    ? `\nCheatsheet에 없는 함수 (모델 지식 사용): ${missing.join(", ")}`
    : "";

    return sections + missingNote;
}

// ── 코드 펜스(```) 처리 ──────────────────────────────────
// 누적 문자열 전체를 매 청크마다 정규식/lastIndexOf로 스캔하면
// 스트리밍이 길어질수록 O(n^2)에 가까운 비용이 발생한다.
// 아래 헬퍼들은 "처음 몇 글자"와 "끝 몇 글자"만 검사해 O(1)로 동작한다.

// 선행 ```lang\n 펜스의 길이를 계산 (앞부분 일부만 검사)
function getLeadingFenceLength(text) {
    const head = text.slice(0, 24);
    const match = head.match(/^```[a-zA-Z0-9]*\n?/);

    return match ? match[0].length : 0;
}

// 끝부분의 ``` (또는 일부) 펜스를 제거 (끝 3글자만 검사)
function stripTrailingFence(text) {
    if (text.endsWith("```")) return text.slice(0, -3);
    if (text.endsWith("``")) return text.slice(0, -2);
    if (text.endsWith("`")) return text.slice(0, -1);

    return text;
}

// 최종 결과에서 마지막 '}' 이후의 잡텍스트를 제거 (스트리밍 종료 후 1회만 호출)
function trimAfterLastBrace(text) {
    const end = text.lastIndexOf("}");

    if (end !== -1) {
        text = text.slice(0, end + 1);
    }

    return text.trim();
}

// ── 2단계: 예제 코드 생성 (스트리밍) ─────────────────────
async function fetchExampleCode(
    userInput,
    mappingResult,
    windowsVer,
    arch,
    onStream,
    signal
) {
    const {
        ntFunctions = [],
        mapping = [],
    } = mappingResult;

    const { found, missing } =
    lookupCheatsheet(ntFunctions);

    const cheatsheetCtx =
    buildCheatsheetContext(found, missing);

    const mappingSummary = mapping
    .map(
        (m) =>
        `${m.winapi} -> ${m.ntapi}: ${m.description}`
    )
    .join("\n");

    const system = `You are an expert Windows Native API engineer.
    Target: ${windowsVer} ${arch}, MSVC 19.3+

    Coding rules:
    - Use only documented NT structures
    - No pseudocode
    - Use UNICODE_STRING for paths
    - Use OBJECT_ATTRIBUTES
    - Use IO_STATUS_BLOCK where needed
    - Use NtClose()
    - Valid C17
    - Must compile with MSVC /W4 /WX
    - Do not invent typedefs
    - If exact mapping is unknown, add comments

    Reference:
    ${cheatsheetCtx || "(cheatsheet 없음 — 모델 지식 활용)"}`;

    const prompt = `Generate a complete compilable C example.

    Mappings:
    ${mappingSummary}

    Original WinAPI code / intent:
    ${userInput}

    Return ONLY raw C code.
    Do NOT use markdown fences.`;

    // 선행 펜스 길이는 누적 텍스트가 충분히 모이면 한 번만 계산해 캐시
    let leadingFenceLength = null;

    return streamLlm(
        [{ role: "user", content: prompt }],
        system,
        {
            temperature: 0.1,
            signal,

            onChunk(token, accumulated) {
                if (!accumulated) return;

                if (leadingFenceLength === null) {
                    // ```c\n 같은 펜스를 판별하기엔 너무 짧으면 대기
                    if (accumulated.length < 4) return;

                    leadingFenceLength = getLeadingFenceLength(accumulated);
                }

                let clean = accumulated.slice(leadingFenceLength);

                clean = stripTrailingFence(clean);

                onStream(clean);
            },
        }
    );
}

// ── 메인 흐름 ────────────────────────────────────────────
async function runAnalysis() {
    const userInput = textarea.value.trim();

    const windowsVer =
    document.getElementById("version").value;

    const arch =
    document.getElementById("arch").value;

    if (!userInput) {
        alert(
            "WinAPI 함수 또는 코드를 입력하세요."
        );
        return;
    }

    currentController?.abort();
    currentController = new AbortController();

    const { signal } = currentController;

    runButton.disabled = true;
    stopButton.hidden = false;
    stopButton.disabled = false;

    resultContainer.innerHTML =
    renderSkeleton("매핑 분석 중...");

    let mappingResult = null;
    let streamedCode = "";

    try {
        // ── 1단계 ──
        mappingResult = await fetchMapping(
            userInput,
            windowsVer,
            arch,
            signal
        );

        // 매핑 결과 즉시 렌더링
        renderResult(
            mappingResult,
            "",
            true
        );

        // ── 2단계 ──
        await fetchExampleCode(
            userInput,
            mappingResult,
            windowsVer,
            arch,

            (partialCode) => {
                streamedCode = partialCode;

                updateStreamingCode(
                    streamedCode
                );
            },

            signal
        );

        streamedCode = trimAfterLastBrace(
            stripTrailingFence(streamedCode).replace(/^```[a-z]*\n?/i, "")
        );

        // 최종 렌더링
        renderResult(
            mappingResult,
            streamedCode,
            false
        );

    } catch (err) {
        if (err.name === "AbortError") {
            if (suppressAbortUi) {
                suppressAbortUi = false;
                return;
            }

            // 사용자가 직접 중단한 경우: 지금까지의 결과는 유지하고
            // 다시 시도할 수 있는 안내를 추가로 표시
            if (mappingResult) {
                streamedCode = trimAfterLastBrace(
                    stripTrailingFence(streamedCode).replace(/^```[a-z]*\n?/i, "")
                );

                renderResult(
                    mappingResult,
                    streamedCode,
                    false
                );
            } else {
                resultContainer.innerHTML = `
                <article class="result-card">
                <h3>생성이 중단되었습니다</h3>
                <p>결과를 받기 전에 중단되었습니다.</p>
                </article>`;
            }

            renderStoppedNotice();
            return;
        }

        console.error(err);

        if (isConnectionError(err)) {
            // 연결 실패 모달이 이미 표시되므로 결과 영역은 초기 상태로 되돌림
            resultContainer.innerHTML = `
            <article class="result-card">
            <h3>결과</h3>
            <p>llama.cpp 서버에 연결할 수 없습니다. 안내된 설치 방법을 확인하세요.</p>
            </article>`;
        } else {
            resultContainer.innerHTML = `
            <article class="result-card">
            <h3>오류</h3>
            <p>결과를 불러오지 못했습니다.</p>
            <pre>${escapeHtml(String(err))}</pre>
            </article>`;
        }

    } finally {
        Prism.highlightAll();
        runButton.disabled = false;
        runButton.textContent = "결과 확인";
        stopButton.hidden = true;
        stopButton.disabled = false;
    }
}

runButton.addEventListener("click", runAnalysis);

// ── 중단 버튼 ────────────────────────────────────────────
stopButton.addEventListener("click", () => {
    stopButton.disabled = true;
    currentController?.abort();
});

// ── 중단 후 다시 시도 안내 ───────────────────────────────
function renderStoppedNotice() {
    const notice = document.createElement("article");
    notice.className = "result-card";
    notice.innerHTML = `
    <h3>생성이 중단되었습니다</h3>
    <p style="color:var(--muted);font-size:14px;">
    아래 버튼을 눌러 동일한 입력으로 다시 시도할 수 있습니다.
    </p>
    <div class="actions">
        <button class="btn btn--primary" type="button" data-action="retry-analysis">
            다시 시도
        </button>
    </div>`;

    notice.querySelector('[data-action="retry-analysis"]')
    .addEventListener("click", runAnalysis);

    resultContainer.appendChild(notice);
}

resetButton.addEventListener("click", () => {
    if (currentController) {
        suppressAbortUi = true;
        currentController.abort();
        currentController = null;
    }

    runButton.disabled = false;
    runButton.textContent = "결과 확인";
    stopButton.hidden = true;
    stopButton.disabled = false;

    textarea.value = "";

    resultContainer.innerHTML = `
    <article class="result-card">
    <h3>결과</h3>
    <p>분석 결과가 여기에 표시됩니다.</p>
    </article>`;
});

// ── 렌더링 ───────────────────────────────────────────────
function renderSkeleton(message) {
    return `
    <article class="result-card">
    <h3>${escapeHtml(message)}</h3>
    <p style="color:var(--muted);font-size:14px;">
    잠시 기다려 주세요...
    </p>
    </article>`;
}

function renderResult(
    mapping,
    exampleCode = null,
    codeLoading = false
) {
    const ntFunctions = (
        mapping.ntFunctions || []
    )
    .map(
        (fn) =>
        `<span class="tag">${escapeHtml(fn)}</span>`
    )
    .join("");

    const mappingRows = (
        mapping.mapping || []
    )
    .map(
        (item) => `
        <tr>
        <td>${escapeHtml(item.winapi)}</td>
        <td>${escapeHtml(item.ntapi)}</td>
        <td>${escapeHtml(item.description)}</td>
        </tr>`
    )
    .join("");

    const notes = (mapping.notes || [])
    .map(
        (note) =>
        `<li class="notice-item">${escapeHtml(note)}</li>`
    )
    .join("");

    // cheatsheet 히트 배지 표시
    const cheatsheetBadges =
    buildCheatsheetBadges(
        mapping.ntFunctions || []
    );

    const codeSection = codeLoading
    ? `
    <article class="result-card">
    <h3>예제 코드</h3>

    <div class="code-box">
    <pre><code id="streaming-code" class="language-c"></code></pre>
    </div>
    </article>
    `
    : `
    <article class="result-card">
    <h3>예제 코드</h3>

    <div class="code-box">
    <pre><code class="language-c">${escapeHtml(exampleCode ?? "")}</code></pre>
    </div>
    </article>
    `;

    resultContainer.innerHTML = `
    <article class="result-card">
    <h3>대응 Nt* 함수</h3>

    <div class="tag-list">
    ${ntFunctions}
    </div>

    ${cheatsheetBadges}
    </article>

    <article class="result-card">
    <h3>함수 매핑</h3>

    <table class="data-table">
    <thead>
    <tr>
    <th>WinAPI</th>
    <th>Nt*</th>
    <th>설명</th>
    </tr>
    </thead>

    <tbody>
    ${mappingRows}
    </tbody>
    </table>
    </article>

    <article class="result-card">
    <h3>참고 사항</h3>

    <ul class="notice-list">
    ${notes}
    </ul>
    </article>

    ${codeSection}
    `;

    runButton.textContent = codeLoading
    ? "코드 생성 중..."
    : "결과 확인";
}

// ── 스트리밍 코드 업데이트 ───────────────────────────────
//let highlightTimer = null;

function updateStreamingCode(code) {
    const codeEl = document.querySelector(
        "#streaming-code"
    );

    if (!codeEl) return;

    codeEl.textContent = code;

    //clearTimeout(highlightTimer);

    /*highlightTimer = setTimeout(() => {
        Prism.highlightElement(codeEl);
    }, 50);*/

    resultContainer.scrollTop =
    resultContainer.scrollHeight;
}

// ── cheatsheet 배지 ─────────────────────────────────────
function buildCheatsheetBadges(ntFunctions) {
    if (
        !ntFunctions.length ||
        !window.NT_CHEATSHEET
    ) {
        return "";
    }

    const hits = ntFunctions.filter((fn) =>
    window.NT_CHEATSHEET.has(fn)
    );

    const misses = ntFunctions.filter(
        (fn) =>
        !window.NT_CHEATSHEET.has(fn)
    );

    if (!hits.length && !misses.length) {
        return "";
    }

    const hitBadges = hits
    .map(
        (fn) =>
        `<span class="badge badge--hit" title="cheatsheet 참조">
        📋 ${escapeHtml(fn)}
        </span>`
    )
    .join("");

    const missBadges = misses
    .map(
        (fn) =>
        `<span class="badge badge--miss" title="모델 지식 사용">
        🔍 ${escapeHtml(fn)}
        </span>`
    )
    .join("");

    return `
    <div
    class="badge-row"
    style="
    margin-top:10px;
    display:flex;
    flex-wrap:wrap;
    gap:6px;
    font-size:12px;
    "
    >
    ${hitBadges}
    ${missBadges}
    </div>

    <p
    style="
    margin:8px 0 0;
    font-size:12px;
    color:var(--subtle);
    "
    >
    📋 cheatsheet 참조
    &nbsp;·&nbsp;
    🔍 모델 지식 사용
    </p>`;
}

// ── HTML escape ─────────────────────────────────────────
function escapeHtml(text) {
    return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
