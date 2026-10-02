# Fact table — agent-skills-with-evals

Form: the fact entry of spec-driven-dev-playbook (`templates/fact-entry.md`). One fact per entry, with
the date, the command, its output as printed, what follows from it and the decisions that depend on it.
A fact is measured again before a decision depends on it. When a measurement overturns an entry, the
entry stays as it was and a "Superseded" box is added under it.

F1–F22 were measured by the author while preparing this pack, on 2026-10-02: on **the host** (the Linux
machine that runs the implementation) unless the entry says **the author's Windows PC**, or **the
public web** (read-only, unauthenticated requests). The run appends its own measurements from F23 on. In
the outputs, paths under the account's home directory are shown as `~` and temporary directories as
`<tmp>`; JSON lines are cut where the entry says so; nothing else is changed.

### F1: The host is Ubuntu 20.04.6 with 12 CPUs and 46 GiB

- Measured on: 2026-10-02 / last re-measured: 2026-10-02
- Measured by: the author, on the host
- Commands:

```
lsb_release -ds 2>/dev/null; uname -r; nproc; free -g | sed -n 2p; df -h $HOME | tail -n 1
```

- Output:

```
Ubuntu 20.04.6 LTS
5.4.0-216-generic
12
Mem:             46           1           2           0          42          44
/dev/sdb2       916G  148G  721G  18% /
```

- What follows: the machine line of the measurements made here.
- Decisions that depend on it: the results' machine description.

### F2: Node v24.19.0; pnpm 11.28.0 is selected by `packageManager`; this skeleton installs in 1.4 s with no build script

- Measured on: 2026-10-02 / last re-measured: 2026-10-02
- Measured by: the author, on the host, in a scratch copy of this repository's configuration files with
  a few planted source files
- Commands:

```
node --version
(cd / && pnpm --version); pnpm --version     # outside any project, then inside the copy
pnpm install                                  # last lines kept
node skills/skill-trigger-probe/scripts/add.ts && echo "exit $?"
pnpm typecheck                                # with `enum Color { Red }` planted in harness/
pnpm typecheck                                # after removing it
pnpm exec biome check . --verbose             # last lines kept
pnpm test                                     # summary lines kept
```

- Output:

```
v24.19.0
11.22.0
11.28.0
devDependencies:
+ @biomejs/biome 2.5.14
+ @types/node 24.19.0 (26.6.3 is available)
+ pnpm 11.28.0 (12.8.1 is available)
+ typescript 7.0.2
+ vitest 5.0.2

Done in 1.4s using pnpm v11.28.0
exit 0
harness/bad-enum.ts(1,6): error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.
[ELIFECYCLE] Command failed with exit code 1.
$ tsc --noEmit
exit 0
Checked 4 files in 2ms. No fixes applied.
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

- What follows: the global pnpm is 11.22.0 and switches itself to 11.28.0 inside the repository;
  corepack is not enabled on this host and stays so. No dependency asks for a build script, so
  `allowBuilds` stays empty. Node runs `.ts` files directly; `erasableSyntaxOnly` refuses an `enum`.
  Biome checked `biome.json`, `vitest.config.ts` and the two planted `.ts` files.
- Decisions that depend on it: the given `package.json`, `tsconfig.json` and `biome.json`; "a skill
  directory stands alone" (SCOPE.md); red line 8.

### F3: bash 5.0.17, git 2.25.1, jq 1.6, gawk 5.0.1, Python 3.8.10; ripgrep 15.2.0 is on the run's PATH

- Measured on: 2026-10-02 / last re-measured: 2026-10-02
- Measured by: the author, on the host
- Commands:

```
bash --version | head -n 1; git --version; jq --version; awk --version 2>&1 | head -n 1
PATH="$HOME/portfolio-runs/bin:$PATH" rg --version | head -n 1
python3 --version
```

- Output:

```
GNU bash, version 5.0.17(1)-release (x86_64-pc-linux-gnu)
git version 2.25.1
jq-1.6
GNU Awk 5.0.1, API: 2.0 (GNU MPFR 4.0.2, GNU MP 6.2.0)
ripgrep 15.2.0 (rev e89fff89ac)
Python 3.8.10
```

- What follows: `bash` exists for the `CLAUDE_CALL_ENV_FILE` wrapper; `jq` 1.6 is there for reading
  outputs by hand. Nothing in this repository needs Python.
- Decisions that depend on it: SCOPE.md, "Every `claude` this repository starts".

### F4: The host's CLI is Claude Code 2.1.233, and these flags are in its help

- Measured on: 2026-10-02 / last re-measured: 2026-10-02
- Measured by: the author, on the host
- Commands:

```
claude --version; command -v claude; readlink -f "$(command -v claude)"
claude --help 2>&1 | grep -E -- '--(system-prompt|append-system-prompt|tools|strict-mcp-config|no-session-persistence|max-turns|output-format|verbose|setting-sources|permission-mode|allowedTools|disallowedTools|effort|max-budget-usd|bare|restricted|safe-mode|permission-prompts|disable-slash-commands|settings|add-dir|model|input-format|json-schema)'
claude --help 2>&1 | grep -A3 -- '--permission-mode'
```

- Output (the first line of each option kept):

```
2.1.233 (Claude Code)
/usr/local/bin/claude
/usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe
  --add-dir <directories...>            Additional directories to allow tool
  --allowedTools, --allowed-tools <tools...>
  --append-system-prompt <prompt>       Append a system prompt to the default
  --bare                                Minimal mode: skip hooks, LSP, plugin
  --disable-slash-commands              Disable all skills
  --disallowedTools, --disallowed-tools <tools...>
  --effort <level>                      Effort level for the current session
  --input-format <format>               Input format (only works with --print):
  --json-schema <schema>                JSON Schema for structured output
  --max-budget-usd <amount>             Maximum dollar amount to spend on API
  --model <model>                       Model for the current session. Provide
  --no-session-persistence              Disable session persistence - sessions
  --output-format <format>              Output format (only works with --print):
  --permission-mode <mode>              Permission mode to use for the session
  --safe-mode                           Start with all customizations
  --setting-sources <sources>           Comma-separated list of setting sources
  --settings <file-or-json>             Path to a settings JSON file or a JSON
  --strict-mcp-config                   Only use MCP servers from --mcp-config,
  --system-prompt <prompt>              System prompt to use for the session
  --tools <tools...>                    Specify the list of available tools from
  --verbose                             Override verbose mode setting from
                                        (choices: "acceptEdits", "auto",
                                        "bypassPermissions", "manual",
                                        "dontAsk", "plan")
```

- What follows: every flag SCOPE.md uses exists on this version. `--max-turns` is not in the help but
  is accepted (F7 runs with it). `--bare` reads no OAuth credential (its help says so on the Windows PC's
  newer version), so it is not used. The CLI on this host is shared and is not upgraded; the Windows PC
  has a newer one (F13).
- Decisions that depend on it: the flags of the probe, the A/B arms and the narration call.

### F5: Ports 18450–18459 are free

- Measured on: 2026-10-02 / last re-measured: 2026-10-02
- Measured by: the author, on the host
- Commands:

```
ss -ltnH | awk '{print $4}' | grep -E ':1845[0-9]$' || echo 'none listening in 18450-18459'
ss -ltnH | awk '{print $4}' | sed 's/.*://' | sort -n | uniq | tr '\n' ' '
```

- Output:

```
none listening in 18450-18459
22 53 139 445 631 3128 3350 3389
```

- What follows: the mocks use 18451, 18452 and 18453 on 127.0.0.1. The other listeners belong to
  other users of this machine and are not touched.
- Decisions that depend on it: SCOPE.md, "Ports".

### F6: The proxy is set in both letter cases and bypasses 127.0.0.1 and localhost

- Measured on: 2026-10-02 / last re-measured: 2026-10-02
- Measured by: the author, on the host (presence only, never the values), and on the Windows PC
- Commands:

```
# host
. "$HOME/.proxy_env"; for v in HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy; do printf '%s=%s\n' "$v" "$( [ -n "${!v:-}" ] && echo set || echo unset)"; done
. "$HOME/.proxy_env"; for v in NO_PROXY no_proxy; do val="${!v:-}"; case ",$val," in *,127.0.0.1,*) r=yes;; *) r=no;; esac; case ",$val," in *,localhost,*) l=yes;; *) l=no;; esac; printf '%s: contains 127.0.0.1=%s localhost=%s\n' "$v" "$r" "$l"; done
# Windows PC, Node v24.15.0
node -e "fetch('https://api.github.com/rate_limit',{signal:AbortSignal.timeout(15000)}).then(r=>console.log('no env proxy: http',r.status)).catch(e=>console.log('no env proxy: ERR', e.cause?.code||e.name||e.message))"
NODE_USE_ENV_PROXY=1 node -e "fetch('https://api.github.com/rate_limit',{signal:AbortSignal.timeout(15000)}).then(r=>console.log('NODE_USE_ENV_PROXY=1: http',r.status, 'remaining', r.headers.get('x-ratelimit-remaining'))).catch(e=>console.log('NODE_USE_ENV_PROXY=1: ERR', e.cause?.code||e.name||e.message))"
```

- Output (Node's warnings on stderr left out):

```
HTTP_PROXY=set
HTTPS_PROXY=set
NO_PROXY=set
http_proxy=set
https_proxy=set
no_proxy=set
NO_PROXY: contains 127.0.0.1=yes localhost=yes
no_proxy: contains 127.0.0.1=yes localhost=yes
no env proxy: http 200
NODE_USE_ENV_PROXY=1: http 200 remaining 42
```

- What follows: on the host, a tool that honours the proxy variables still reaches a mock on
  127.0.0.1 directly, because both bypass lists name it. From the Windows PC, Node's `fetch` reached
  GitHub with and without `NODE_USE_ENV_PROXY=1`; on the host direct egress fails TLS (measured for
  ci-devex-toolkit, its F7), so a live GitHub call from the host would need the proxy — the run makes
  none. The proxy variables are visible to the tools of a session (F10), so the A/B runner redacts
  their values from everything it writes.
- Decisions that depend on it: the redaction of the A/B runner; red line 5.

### F7: How `claude -p` shows a skill trigger in stream-json (CLI 2.1.233), and why the exit code does not decide

- Measured on: 2026-10-02 / last re-measured: 2026-10-02
- Measured by: the author, on the host, in `<tmp>/proj` holding `.claude/skills/tea-timer/SKILL.md`
  (description: "Steeping times and water temperatures for green, black and oolong tea. Use when the
  user asks how long to steep tea or how hot the water should be. Not for coffee.") and
  `.claude/skills/long-desc/SKILL.md`, with a fresh `CLAUDE_CONFIG_DIR=<tmp>/cfg` and the token from the
  environment; the query on stdin
- Commands (first the live runs, printed by the probe script; then the same facts read from the
  committed samples, which anyone can re-run):

```
( cd <tmp>/proj && timeout 240 claude -p --model sonnet --output-format stream-json --verbose --max-turns 1 < q.txt > out.jsonl 2> out.err ); echo "rc=$?"
#   q.txt: "How long should I steep green tea, and how hot should the water be?"   (then: "What is the capital of Australia?")
jq -r '[.type, (.subtype // "")] | join("/")' out.jsonl | uniq -c
jq -c 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | {name, input}' out.jsonl
jq -c 'select(.type=="user") | .message.content[]? | select(.type=="tool_result") | {is_error, content: ((.content|tostring)[:240])}' out.jsonl
jq -c 'select(.type=="result") | {subtype, is_error, num_turns, duration_ms, total_cost_usd, usage: {input: .usage.input_tokens, cache_create: .usage.cache_creation_input_tokens, cache_read: .usage.cache_read_input_tokens, output: .usage.output_tokens}, models: ((.modelUsage // {}) | keys)}' out.jsonl

jq -c 'select(.type=="result") | {subtype, is_error, terminal_reason, stop_reason, num_turns}' fixtures/streams/host-cli-2.1.233/trigger.jsonl
jq -c 'select(.type=="user") | .message.content[] | if .type=="tool_result" then {tool_result: .content} else {text: .text[:60]} end' fixtures/streams/host-cli-2.1.233/trigger.jsonl
jq -c 'select(.type=="system" and .subtype=="init") | .skills' fixtures/streams/host-cli-2.1.233/trigger.jsonl
jq -c 'select(.type=="assistant") | .message.content[] | select(.type=="tool_use") | {name, input}' fixtures/streams/host-cli-2.1.233/sibling.jsonl
```

- Output:

```
=== pos-sonnet (model sonnet) rc=1
      1 system/init
      1 rate_limit_event/
      2 system/thinking_tokens
      2 assistant/
      2 user/
      1 result/error_max_turns
{"name":"Skill","input":{"skill":"tea-timer","args":"green tea steeping time and water temperature"}}
{"is_error":null,"content":"Launching skill: tea-timer"}
{"subtype":"error_max_turns","is_error":true,"num_turns":2,"duration_ms":3576,"total_cost_usd":0.20399799999999998,"usage":{"input":2,"cache_create":33495,"cache_read":0,"output":161},"models":["claude-haiku-4-5-20251001","claude-sonnet-5"]}

=== neg-sonnet (model sonnet) rc=0
      1 system/init
      1 rate_limit_event/
      1 assistant/
      1 result/success
{"subtype":"success","is_error":false,"num_turns":1,"duration_ms":1688,"total_cost_usd":0.0316783,"usage":{"input":2,"cache_create":3652,"cache_read":29841,"output":15},"models":["claude-haiku-4-5-20251001","claude-sonnet-5"]}

{"subtype":"error_max_turns","is_error":true,"terminal_reason":"max_turns","stop_reason":"tool_use","num_turns":2}
{"tool_result":"Launching skill: tea-timer"}
{"text":"Base directory for this skill: <project>/.claude/skills/tea-"}
["long-desc","tea-timer","deep-research","design-sync","dataviz","update-config","verify","debug","code-review","simplify","batch","fewer-permission-prompts","doctor","loop","schedule","claude-api","run","run-skill-generator"]
{"name":"ToolSearch","input":{"query":"select:WebSearch,WebFetch","max_results":5}}
```

- What follows: a trigger is a `tool_use` named `Skill` with `input.skill`; the CLI answers with a
  `tool_result` "Launching skill: <name>" and a second `user` event carrying the skill's body ("Base
  directory for this skill: …"). Under `--max-turns 1` **a run that used any tool exits 1** with
  `error_max_turns` — a valid run, not a failure. The init event lists the loaded skills: the project's
  two and the CLI's own, even with a fresh configuration directory, so the CLI's skills are always
  siblings. A third recorded run (a "deep research" request) used `ToolSearch` first and fired no skill.
  The three samples, redacted, are `fixtures/streams/host-cli-2.1.233/{trigger,no-trigger,sibling}.jsonl`.
- Decisions that depend on it: the stream parser's rules; the probe's "not-loaded" check.

### F8: Without credentials the result says `subtype: "success"` — only `terminal_reason` and the assistant's `error` tell

- Measured on: 2026-10-02 / last re-measured: 2026-10-02
- Measured by: the author, on the host, as F7 but with `env -u CLAUDE_CODE_OAUTH_TOKEN
  CLAUDE_CONFIG_DIR=<tmp>/cfg2`
- Commands (the live run, then the facts read from its committed sample):

```
( cd <tmp>/proj && env -u CLAUDE_CODE_OAUTH_TOKEN CLAUDE_CONFIG_DIR=<tmp>/cfg2 timeout 240 claude -p --model sonnet --output-format stream-json --verbose --max-turns 1 --no-session-persistence < q.txt > no-credentials.jsonl 2> no-credentials.err ); echo "rc=$?"
jq -c 'select(.type=="result") | {subtype, is_error, terminal_reason, num_turns, total_cost_usd, result}' fixtures/streams/host-cli-2.1.233/no-credentials.jsonl
jq -c 'select(.type=="assistant") | {error, model: .message.model, text: .message.content[0].text}' fixtures/streams/host-cli-2.1.233/no-credentials.jsonl
```

- Output:

```
rc=1
{"subtype":"success","is_error":true,"terminal_reason":"api_error","num_turns":1,"total_cost_usd":0,"result":"Not logged in · Please run /login"}
{"error":"authentication_failed","model":"<synthetic>","text":"Not logged in · Please run /login"}
```

- What follows: a harness that trusts `subtype` counts this run as a valid "not triggered" — the
  failure mode of the author's practice, where a silently broken measurement looked like a skill that
  never fires. The parser classifies it as broken (`auth`). The sample is
  `fixtures/streams/host-cli-2.1.233/no-credentials.jsonl`.
- Decisions that depend on it: the stream parser's "broken" rules.

### F9: Inside a session, the tools do not get the CLI's credential: a nested `claude -p` fails unless it sources the environment file

- Measured on: 2026-10-02 / last re-measured: 2026-10-02
- Measured by: the author, on the host: an outer `claude -p --model sonnet --permission-mode
  bypassPermissions` session started like the run's worker (the run's environment file sourced,
  `GOALBUS_ENV_FILE` exported), asked to run one script with its Bash tool
- Commands (the script the outer session ran; it prints presence only):

```
printf 'CLAUDE_CODE_OAUTH_TOKEN:%s\n' "${CLAUDE_CODE_OAUTH_TOKEN:+present}"
printf 'CLAUDE_CONFIG_DIR:%s\n' "${CLAUDE_CONFIG_DIR:+present}"
printf 'GOALBUS_ENV_FILE:%s\n' "${GOALBUS_ENV_FILE:+present}"
printf 'HTTPS_PROXY:%s\n' "${HTTPS_PROXY:+present}"
d="$(mktemp -d)"; cd "$d"
timeout 120 claude -p --model sonnet --output-format json --no-session-persistence 'Reply with exactly: PONG' < /dev/null > plain.json 2> plain.err
printf 'plain: rc=%s ' "$?"; jq -r '"result=\(.result) is_error=\(.is_error)"' plain.json
( . "$GOALBUS_ENV_FILE"; timeout 120 claude -p --model sonnet --output-format json --no-session-persistence 'Reply with exactly: PONG' < /dev/null > sourced.json 2> sourced.err )
printf 'sourced: rc=%s ' "$?"; jq -r '"result=\(.result) is_error=\(.is_error)"' sourced.json
```

- Output (as the tool returned it to the outer session):

```
CLAUDE_CODE_OAUTH_TOKEN:
CLAUDE_CONFIG_DIR:present
GOALBUS_ENV_FILE:present
HTTPS_PROXY:present
plain: rc=1 result=Not logged in · Please run /login is_error=true

sourced: rc=0 result=PONG is_error=false
```

- What follows: the CLI removes its own token from the environment of its tools, so this repository's
  nested calls authenticate through a file named by `CLAUDE_CALL_ENV_FILE` (on this host, the run's
  environment file, which only sources the token and proxy files). The worker never opens that file; the
  launcher sources it in a child shell. On the Windows PC the login lives in the CLI's own configuration
  directory, and the variable is not needed.
- Decisions that depend on it: `CLAUDE_CALL_ENV_FILE` (SCOPE.md); red line 3.

### F10: An A/B arm as the runner starts it: credential through the file, `HOME` and `CLAUDE_CONFIG_DIR` overridden afterwards, and what its tools see

- Measured on: 2026-10-02 / last re-measured: 2026-10-02
- Measured by: the author, on the host, from an environment without the token (as a worker's tools
  have it), with the wrapper SCOPE.md describes
- Commands:

```
# <tmp>/arm.sh:
f="$1"; shift
. "$f"
exec env -u CLAUDE_CALL_ENV_FILE -u GOALBUS_ENV_FILE -u CLAUDECODE "$@"

( cd <tmp>/ws && env -u CLAUDE_CODE_OAUTH_TOKEN CLAUDE_CALL_ENV_FILE="$HOME/portfolio-runs/bus.env" GOALBUS_ENV_FILE="$HOME/portfolio-runs/bus.env" \
    timeout 300 bash <tmp>/arm.sh "$HOME/portfolio-runs/bus.env" HOME=<tmp>/home CLAUDE_CONFIG_DIR=<tmp>/cfg \
    claude -p --model sonnet --output-format stream-json --verbose --no-session-persistence --strict-mcp-config \
      --permission-mode bypassPermissions --max-budget-usd 1 \
      --disallowedTools WebFetch WebSearch 'Bash(sudo:*)' 'Bash(docker:*)' \
      --append-system-prompt "$NOTICE" < <tmp>/prompt.txt > <tmp>/arm.jsonl 2> <tmp>/arm.err )
echo "arm rc=$?"
jq -c 'select(.type=="system" and .subtype=="init") | {model, permissionMode, tools, cwd_is_ws: (.cwd|endswith("/ws")), memory_under_cfg: ((.memory_paths.auto // "") | contains("/cfg/"))}' <tmp>/arm.jsonl
jq -r 'select(.type=="user") | .message.content[]? | select(.type=="tool_result") | (.content | if type=="array" then map(.text // "") | join("") else tostring end) | .[:400]' <tmp>/arm.jsonl
jq -c 'select(.type=="result") | {subtype, is_error, terminal_reason, num_turns, duration_ms, total_cost_usd, result: (.result[:200])}' <tmp>/arm.jsonl
# NOTICE: "You are running inside an evaluation sandbox. Work only inside the current working directory. Do not read, list or search anything outside it. Do not print environment variables."
# prompt.txt: create hello.txt containing "hi", then run this with the Bash tool and reply with its output only:
#   echo "home=$HOME"; echo "pwd=$PWD"; printenv CLAUDE_CODE_OAUTH_TOKEN >/dev/null && echo token-visible || echo token-hidden; printenv CLAUDE_CALL_ENV_FILE >/dev/null && echo envfile-visible || echo envfile-hidden; printenv GOALBUS_ENV_FILE >/dev/null && echo goalbus-visible || echo goalbus-hidden; printenv HTTPS_PROXY >/dev/null && echo proxy-visible || echo proxy-hidden
```

- Output:

```
arm rc=0
{"model":"claude-sonnet-5","permissionMode":"bypassPermissions","tools":["Task","Bash","CronCreate","CronDelete","CronList","DesignSync","Edit","EnterWorktree","ExitWorktree","ListAgents","Monitor","NotebookEdit","PushNotification","Read","RemoteTrigger","ReportFindings","ScheduleWakeup","SendMessage","Skill","TaskOutput","TaskStop","ToolSearch","Workflow","Write"],"cwd_is_ws":true,"memory_under_cfg":true}
File created successfully at: <tmp>/ws/hello.txt (file state is current in your context — no need to Read it back)
home=<tmp>/home
pwd=<tmp>/ws
token-hidden
envfile-hidden
goalbus-hidden
proxy-visible
{"subtype":"success","is_error":false,"terminal_reason":"completed","num_turns":3,"duration_ms":7463,"total_cost_usd":0.2210196,"result":"home=<tmp>/home\npwd=<tmp>/ws\ntoken-hidden\nenvfile-hidden\ngoalbus-hidden\nproxy-visible"}
```

- What follows: the arm authenticated; `WebFetch` and `WebSearch` disappeared from its tools (compare
  the tool list of F7's sessions, which has them); its tools saw the temporary `HOME`, neither the token
  nor the environment-file names — **but they did see the proxy variables**, which carry credentials.
  The arm wrote `hello.txt` in `ws/` and left files only in its own configuration directory.
- Decisions that depend on it: the A/B runner's command line and its redaction (SCOPE.md).

### F11: The CLI cuts an over-long description after 1,536 characters before the model sees it

- Measured on: 2026-10-02 / last re-measured: 2026-10-02
- Measured by: the author, on the host (CLI 2.1.233, sonnet and opus) and on the Windows PC (CLI
  2.1.287, sonnet): a skill `long-desc` whose 2,600-character description has a marker `[mNNNN]` starting
  at character NNNN every 100 characters (`[m0001] … [m2501]`)
- Commands:

```
# host
( cd <tmp>/proj && timeout 240 claude -p --model <sonnet|opus> --output-format json --max-turns 1 --no-session-persistence < q.txt > <name>.json 2> <name>.err )
jq -r '.result' <name>.json | head -c 1500
# Windows PC (win-probe-sk1.mjs): spawn('claude', ['-p', '--strict-mcp-config', '--no-session-persistence', '--model', 'sonnet',
#   '--output-format', 'json', '--max-turns', '1']) with q.txt on stdin, then prints JSON.parse(stdout).result
#   q.txt: "Do not use any tool. In your list of available skills there is one named long-desc. Its description contains
#   markers of the form [mNNNN]. Line 1: list every such marker you can see in that description, in order, separated by
#   single spaces. Line 2: the last 60 characters of that description exactly as you see them, between double quotes. Nothing else."
```

- Output (the `result` of each run):

```
# host, sonnet
m0001 m0101 m0201 m0301 m0401 m0501 m0601 m0701 m0801 m0901 m1001 m1101 m1201 m1301 m1401 m1501
"ghthouse lamps logbook  [m1501] lighthouse lamps logbook vi…"
# host, opus
[m0001] [m0101] [m0201] [m0301] [m0401] [m0501] [m0601] [m0701] [m0801] [m0901] [m1001] [m1101] [m1201] [m1301] [m1401] [m1501]
"ghthouse lamps logbook  [m1501] lighthouse lamps logbook vi…"
# Windows PC, sonnet
[m0001] [m0101] [m0201] [m0301] [m0401] [m0501] [m0601] [m0701] [m0801] [m0901] [m1001] [m1101] [m1201] [m1301] [m1401] [m1501]
"ghthouse lamps logbook  [m1501] lighthouse lamps logbook vi…"
```

- What follows: `[m1501] lighthouse lamps logbook vi` ends at character 1,536; the model saw that much
  and an added `…`, and nothing of `[m1601]` onwards — in both versions and with both models. The
  published limit is 1,024 (F12): between 1,025 and 1,536 the text still reached the model here, beyond
  1,536 it did not. An earlier run with a 1,563-character description whose last marker started at
  character 1,181 also saw it, and its quote ended in `…`.
- Decisions that depend on it: the validator's note on V4; the probe skill's advice.

### F12: The published limits of a `SKILL.md` frontmatter

- Measured on: 2026-10-02 / last re-measured: 2026-10-02
- Measured by: the author, on the public web: https://agentskills.io/specification and
  https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview (the old
  docs.claude.com address redirects there)
- Output (quoted):

```
agentskills.io/specification — Frontmatter
| `name` | Yes | Max 64 characters. Lowercase letters, numbers, and hyphens only. Must not start or end with a hyphen. |
| `description` | Yes | Max 1024 characters. Non-empty. Describes what the skill does and when to use it. |
| `license` | No | License name or reference to a bundled license file. |
| `compatibility` | No | Max 500 characters. Indicates environment requirements (…). |
| `metadata` | No | Arbitrary key-value mapping for additional metadata (a map from string keys to string values). |
| `allowed-tools` | No | Space-separated string of pre-approved tools the skill may use. (Experimental) |
`name`: Must be 1-64 characters · May only contain unicode lowercase alphanumeric characters (`a-z`, `0-9`) and
hyphens (`-`) · Must not start or end with a hyphen (`-`) · Must not contain consecutive hyphens (`--`) ·
Must match the parent directory name
"Keep your main `SKILL.md` under 500 lines."

platform.claude.com — Agent Skills overview
`name`: Maximum 64 characters · Must contain only lowercase letters, numbers, and hyphens · Cannot contain XML
tags · Cannot contain reserved words: "anthropic", "claude"
`description`: Must be non-empty · Maximum 1024 characters · Cannot contain XML tags
```

- What follows: the validator's rules V1–V6 and their sources; the 500-line warning.
- Decisions that depend on it: the validator (SCOPE.md).

### F13: On the Windows PC, Node starts the native `claude.exe` without a shell, with the prompt on stdin, and the stream is the same

- Measured on: 2026-10-02 / last re-measured: 2026-10-02
- Measured by: the author, on the Windows PC (Git Bash, Node v24.15.0), with a Node script that builds
  the same temporary project as F7 and calls `spawn('claude', args, { stdio: ['pipe','pipe','pipe'] })`,
  writing the query to stdin
- Commands:

```
command -v claude; ls ~/.local/bin/ | grep -i claude; claude --version
node win-probe-sk1.mjs <out-dir>
#   spawn('claude', ['-p', '--strict-mcp-config', '--no-session-persistence', '--model', 'sonnet',
#          '--output-format', 'stream-json', '--verbose', '--max-turns', '1'], { cwd: <tmp>/proj, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
#   then child.stdin.end(<query>); the script prints the fields below from each event
```

- Output:

```
~/.local/bin/claude
claude.exe
2.1.287 (Claude Code)
=== trigger rc=1 4587 ms stderr=0 bytes
init {"version":"2.1.287","model":"claude-sonnet-5-5","skills_n":39,"has_tea":true,"has_long":true,"mcp":0,"plugins":5,"apiKeySource":"none"}
tool_use {"name":"Skill","input":{"skill":"tea-timer","args":"green tea: how long to steep and how hot should the water be?"}}
result {"subtype":"error_max_turns","is_error":true,"terminal_reason":"max_turns","num_turns":2,"cost":0.0417914,"thinking":134}
=== no-trigger rc=0 4515 ms stderr=0 bytes
result {"subtype":"success","is_error":false,"terminal_reason":"completed","num_turns":1,"cost":0.0401614,"thinking":0}
```

- What follows: on Windows the CLI is a native executable that `spawn` finds on `PATH` without a
  shell, and a prompt on stdin needs no quoting — the probe works there as on Linux, which is the point
  of it (the author's practice replaced a Python harness that silently reported "not triggered" on
  Windows). The author's own configuration loads 21 more skills and 5 plugins than the host's isolated
  one: on Windows, without `--isolated-config`, they are siblings. The two Windows samples in
  `fixtures/streams/windows-cli-2.1.287/` have those personal entries removed (PROVENANCE.md).
- Decisions that depend on it: the launcher; the probe's `--isolated-config`.

### F14: The narration call's flags work, and on a trivial prompt switching thinking off changes nothing measurable

- Measured on: 2026-10-02 / last re-measured: 2026-10-02
- Measured by: the author, on the host, in a fresh temporary directory, with a fresh configuration
  directory
- Commands:

```
printf 'Return only a JSON object of the form {"items":[{"fruit":"...","note":"..."}]} with three fruits and a one-sentence note on each.\n' > "$T/narr.q"
narr() {  # narr <name> [env assignment] [extra flags...]
  local name="$1" envset="$2"; shift 2
  ( cd "$T" && env $envset timeout 300 claude -p --system-prompt "You answer with JSON only." --tools "" --strict-mcp-config --no-session-persistence --model sonnet --output-format json "$@" < "$T/narr.q" > "$T/$name.json" 2> "$T/$name.err" )
  printf '%-14s rc=%s ' "$name" "$?"
  jq -c '{is_error, duration_ms, total_cost_usd, input: .usage.input_tokens, cache_create: .usage.cache_creation_input_tokens, cache_read: .usage.cache_read_input_tokens, output: .usage.output_tokens, models: ((.modelUsage // {}) | keys), result_is_json: ((.result | fromjson? | type) == "object")}' "$T/$name.json" 2>/dev/null || head -c 200 "$T/$name.err"
}
narr default ""
narr thinking0 "MAX_THINKING_TOKENS=0"
narr effort-low "" --effort low
narr default-2 ""
narr thinking0-2 "MAX_THINKING_TOKENS=0"
```

- Output:

```
default        rc=0 {"is_error":false,"duration_ms":2181,"total_cost_usd":0.003104,"input":193,"cache_create":0,"cache_read":0,"output":127,"models":["claude-haiku-4-5-20251001","claude-sonnet-5"],"result_is_json":true}
thinking0      rc=0 {"is_error":false,"duration_ms":2945,"total_cost_usd":0.003144,"input":193,"cache_create":0,"cache_read":0,"output":130,"models":["claude-haiku-4-5-20251001","claude-sonnet-5"],"result_is_json":true}
effort-low     rc=0 {"is_error":false,"duration_ms":2091,"total_cost_usd":0.0031590000000000003,"input":193,"cache_create":0,"cache_read":0,"output":131,"models":["claude-haiku-4-5-20251001","claude-sonnet-5"],"result_is_json":true}
default-2      rc=0 {"is_error":false,"duration_ms":2360,"total_cost_usd":0.0032890000000000003,"input":193,"cache_create":0,"cache_read":0,"output":139,"models":["claude-haiku-4-5-20251001","claude-sonnet-5"],"result_is_json":true}
thinking0-2    rc=0 {"is_error":false,"duration_ms":2724,"total_cost_usd":0.0031590000000000003,"input":193,"cache_create":0,"cache_read":0,"output":131,"models":["claude-haiku-4-5-20251001","claude-sonnet-5"],"result_is_json":true}
```

- What follows: with `--system-prompt` and `--tools ""` the input is 193 tokens and the answer is
  plain JSON. On this trivial prompt the default, `MAX_THINKING_TOKENS=0` and `--effort low` give the
  same 127–139 output tokens: whether thinking costs anything on the real narration prompt is not known
  from this, and the run measures it there. The result's `usage.output_tokens_details.thinking_tokens`
  reports the thinking part (F7's samples show 23 and 971).
- Decisions that depend on it: the narration call; the thinking measurement of G4.

### F15: Model aliases on each CLI, and what calls cost (CLI-reported, API-equivalent)

- Measured on: 2026-10-02 / last re-measured: 2026-10-02
- Measured by: the author, from the runs of F7, F9, F10, F11 and F13
- Output (collected from those runs' printed results and rewritten as a table — not a command's
  output):

```
host 2.1.233     sonnet → claude-sonnet-5      opus → claude-opus-5      (modelUsage also lists claude-haiku-4-5-20251001)
Windows 2.1.287  sonnet → claude-sonnet-5-5
--max-turns 1, first call in a fresh configuration:  sonnet 33,495 cache-creation tokens, $0.2040 · opus 22,273, $0.2251
--max-turns 1, later calls (cache read ~29.8k):      sonnet $0.0317–0.0339 · Windows sonnet $0.0402–0.0418
the quoting question (1,773 output tokens):          sonnet $0.0588
an agentic arm, first call, 3 turns:                 sonnet $0.2210
```

- What follows: a probe of 20 queries × 3 runs costs one cache creation plus about 60 cache reads
  per skill; the A/B arms cost more per run. These are `total_cost_usd` values, which the author's
  practice found inconsistent between runs: the results quote the token counts beside them.
- Decisions that depend on it: the budget of G4 (`--max-budget-usd` per arm); the results' caveat on
  dollar figures.

### F16: GitHub's REST lists, as served unauthenticated to the public

- Measured on: 2026-10-02 / last re-measured: 2026-10-02
- Measured by: the author, on the public web (from the Windows PC), against a large public repository
  (microsoft/vscode); the responses were saved and read with `jq`; user names are not reproduced
- Commands:

```
curl -sS -m 20 https://api.github.com/rate_limit | jq -c '.resources.core, .rate'
g() { curl -sS -m 30 -D "$1.headers" -o "$1.json" -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' "https://api.github.com$2"; }
g milestones '/repos/microsoft/vscode/milestones?state=open&sort=due_on&direction=asc&per_page=3'
g milestones-desc '/repos/microsoft/vscode/milestones?state=open&sort=due_on&direction=desc&per_page=4'
g issues-open '/repos/microsoft/vscode/issues?milestone=455&state=open&per_page=30'
jq -c '.[] | {number, title, due_on}' milestones.json
jq -c '.[] | {number, title, due_on}' milestones-desc.json
jq -r '.[0] | keys | join(",")' milestones-desc.json
jq -r '.[0] | keys | join(",")' issues-open.json
jq -r '[.[] | select(has("pull_request"))][0] | (.pull_request | keys | join(",")), (has("draft"))' issues-open.json
grep -i -E '^(x-ratelimit|link)' issues-open.headers milestones.headers | tr -d '\r' | cut -c1-150
```

- Output:

```
{"limit":60,"remaining":56,"reset":1790907626,"used":4}
{"limit":60,"remaining":56,"reset":1790907626,"used":4}
{"number":8,"title":"Backlog","due_on":null}
{"number":27,"title":"On Deck","due_on":null}
{"number":107,"title":"Backlog Candidates","due_on":null}
{"number":459,"title":"1.143.0","due_on":"2026-10-19T00:00:00Z"}
{"number":458,"title":"1.142.0","due_on":"2026-10-12T00:00:00Z"}
{"number":455,"title":"1.141.0","due_on":"2026-10-05T00:00:00Z"}
{"number":107,"title":"Backlog Candidates","due_on":null}
closed_at,closed_issues,created_at,creator,description,due_on,html_url,id,labels_url,node_id,number,open_issues,state,title,updated_at,url
active_lock_reason,assignee,assignees,author_association,body,closed_at,closed_by,comments,comments_url,created_at,events_url,html_url,id,issue_dependencies_summary,issue_field_values,labels,labels_url,locked,milestone,node_id,number,performed_via_github_app,pinned_comment,reactions,repository_url,state,state_reason,sub_issues_summary,timeline_url,title,type,updated_at,url,user
diff_url,html_url,merged_at,patch_url,url
true
issues-open.headers:X-RateLimit-Limit: 60
issues-open.headers:X-RateLimit-Remaining: 52
issues-open.headers:X-RateLimit-Used: 8
issues-open.headers:X-RateLimit-Resource: core
issues-open.headers:X-RateLimit-Reset: 1790907626
milestones.headers:Link: <https://api.github.com/repositories/41881900/milestones?state=open&sort=due_on&direction=asc&per_page=3&page=2>; rel="next",
milestones.headers:X-RateLimit-Limit: 60
milestones.headers:X-RateLimit-Remaining: 55
milestones.headers:X-RateLimit-Used: 5
milestones.headers:X-RateLimit-Resource: core
milestones.headers:X-RateLimit-Reset: 1790907626
```

- What follows: a milestone list sorted by `due_on` puts the milestones without a date first when
  ascending, so the digest chooses the current milestone itself instead of trusting an order. The issue
  list of a milestone contains pull requests (`pull_request`, and `draft`). Pages are announced by
  `Link`. Unauthenticated, the limit is 60 requests an hour **for the whole egress address**: the
  remaining count was 56 before the author's first request of the day, and later checks showed less
  than the author's own requests explain (F6 shows 42) — others behind the same proxy use it too.
- Decisions that depend on it: the mock GitHub API's shapes; the collection rules; the README's note on
  `GITHUB_TOKEN`.

### F17: Timeline and review shapes: `committed` has no `created_at`, `reviewed` has `submitted_at` and a lower-case state

- Measured on: 2026-10-02 / last re-measured: 2026-10-02
- Measured by: the author, on the public web, as F16: an open pull request (337603) and an old issue
  (109277) of the same repository
- Commands:

```
g tl-337603 '/repos/microsoft/vscode/issues/337603/timeline?per_page=100'
g reviews-337603 '/repos/microsoft/vscode/pulls/337603/reviews?per_page=100'
g pull-337603 '/repos/microsoft/vscode/pulls/337603'
g tl-109277 '/repos/microsoft/vscode/issues/109277/timeline?per_page=100'
jq -c '.[] | {event, created_at: (.created_at // null), submitted_at: (.submitted_at // null), committer_date: (.committer.date // null), state: (.state // null)}' tl-337603.json | sort -u -t, -k1,1 | head -20
jq -c '[.[] | select(.event=="labeled")][0].label' tl-337603.json
jq -c '.[] | {state, submitted_at}' reviews-337603.json
jq -c '{draft, state, merged, created_at, head: (.head | has("ref")), requested_reviewers: (.requested_reviewers | length)}' pull-337603.json
jq -c '.[] | select(.event=="cross-referenced") | {created_at, type: .source.type, number: .source.issue.number, pr: (.source.issue | has("pull_request")), repo: .source.issue.repository.full_name}' tl-109277.json
```

- Output (in the last command's output, the names of repositories other than the one measured are
  replaced by `<another repository>`):

```
{"event":"assigned","created_at":"2026-09-24T01:32:48Z","submitted_at":null,"committer_date":null,"state":null}
{"event":"comment_deleted","created_at":"2026-09-24T01:32:30Z","submitted_at":null,"committer_date":null,"state":null}
{"event":"commented","created_at":"2026-09-24T04:04:43Z","submitted_at":null,"committer_date":null,"state":null}
{"event":"committed","created_at":null,"submitted_at":null,"committer_date":"2026-09-24T01:00:27Z","state":null}
{"event":"copilot_work_started","created_at":"2026-09-24T01:04:13Z","submitted_at":null,"committer_date":null,"state":null}
{"event":"cross-referenced","created_at":"2026-09-24T01:27:47Z","submitted_at":null,"committer_date":null,"state":null}
{"event":"demilestoned","created_at":"2026-09-24T01:33:17Z","submitted_at":null,"committer_date":null,"state":null}
{"event":"labeled","created_at":"2026-09-24T01:33:01Z","submitted_at":null,"committer_date":null,"state":null}
{"event":"mentioned","created_at":"2026-09-24T04:04:45Z","submitted_at":null,"committer_date":null,"state":null}
{"event":"milestoned","created_at":"2026-09-24T01:33:12Z","submitted_at":null,"committer_date":null,"state":null}
{"event":"ready_for_review","created_at":"2026-09-24T09:32:38Z","submitted_at":null,"committer_date":null,"state":null}
{"event":"renamed","created_at":"2026-09-24T09:26:23Z","submitted_at":null,"committer_date":null,"state":null}
{"event":"review_requested","created_at":"2026-09-24T01:03:21Z","submitted_at":null,"committer_date":null,"state":null}
{"event":"reviewed","created_at":null,"submitted_at":"2026-09-24T01:14:17Z","committer_date":null,"state":"commented"}
{"event":"subscribed","created_at":"2026-09-24T04:04:45Z","submitted_at":null,"committer_date":null,"state":null}
{"name":"linux","color":"006b75"}
{"state":"COMMENTED","submitted_at":"2026-09-24T01:14:17Z"}
{"state":"CHANGES_REQUESTED","submitted_at":"2026-09-24T03:05:16Z"}
{"draft":false,"state":"open","merged":false,"created_at":"2026-09-24T01:03:20Z","head":true,"requested_reviewers":1}
{"created_at":"2021-01-25T22:53:40Z","type":"issue","number":114962,"pr":false,"repo":"microsoft/vscode"}
{"created_at":"2021-01-26T20:02:21Z","type":"issue","number":115131,"pr":false,"repo":"microsoft/vscode"}
{"created_at":"2026-04-17T18:49:53Z","type":"issue","number":311064,"pr":false,"repo":"microsoft/vscode"}
{"created_at":"2026-06-17T01:16:48Z","type":"issue","number":1307,"pr":true,"repo":"<another repository>"}
{"created_at":"2026-09-01T10:03:02Z","type":"issue","number":8913,"pr":false,"repo":"<another repository>"}
```

- What follows: an activity's time is `created_at` for most events, `committer.date` for `committed`
  and `submitted_at` for `reviewed`; a review's state is lower-case in the timeline and upper-case from
  the reviews endpoint. A cross-reference names its source with its repository, and the source carries
  `pull_request` when it is a pull request — **which may belong to another repository** (the fourth
  line): only a pull request of the same repository is a linked pull request.
- Decisions that depend on it: the activity rule; the linking rule; the mock's timeline shapes.

### F18: `updated_at` moves with planning: an issue untouched for years looked updated last month

- Measured on: 2026-10-02 / last re-measured: 2026-10-02
- Measured by: the author, on the public web: the saved timeline of issue 109277 (F17) and its entry
  in the issue list (F16)
- Commands:

```
jq -c '[.[] | select(.event=="commented")] | last | {event, created_at}' tl-109277.json
jq -c '.[] | select(.created_at > "2021-01-15T00:42:39Z") | {event, created_at, label: (.label.name // null), milestone: (.milestone.title // null)}' tl-109277.json
jq -c '[.[] | select(.number==109277)][0] | {created_at, updated_at, issue_dependencies_summary}' issues-open.json
```

- Output (the middle command's monthly milestone moves of 2021-02 to 2021-06 are cut to the first and
  the last):

```
{"event":"commented","created_at":"2021-01-15T00:42:39Z"}
{"event":"referenced","created_at":"2021-01-15T01:06:28Z","label":null,"milestone":null}
{"event":"referenced","created_at":"2021-01-15T08:55:37Z","label":null,"milestone":null}
{"event":"labeled","created_at":"2021-01-25T22:41:52Z","label":"on-testplan","milestone":null}
{"event":"cross-referenced","created_at":"2021-01-25T22:53:40Z","label":null,"milestone":null}
{"event":"demilestoned","created_at":"2021-01-25T23:40:28Z","label":null,"milestone":"January 2021"}
{"event":"milestoned","created_at":"2021-01-25T23:40:28Z","label":null,"milestone":"February 2021"}
{"event":"cross-referenced","created_at":"2021-01-26T20:02:21Z","label":null,"milestone":null}
{"event":"unlabeled","created_at":"2021-02-11T23:51:08Z","label":"on-testplan","milestone":null}
…
{"event":"milestoned","created_at":"2021-06-15T22:57:35Z","label":null,"milestone":"On Deck"}
{"event":"labeled","created_at":"2022-12-05T17:19:26Z","label":"feature-request","milestone":null}
{"event":"subscribed","created_at":"2025-11-20T16:19:04Z","label":null,"milestone":null}
{"event":"cross-referenced","created_at":"2026-04-17T18:49:53Z","label":null,"milestone":null}
{"event":"cross-referenced","created_at":"2026-06-17T01:16:48Z","label":null,"milestone":null}
{"event":"cross-referenced","created_at":"2026-09-01T10:03:02Z","label":null,"milestone":null}
{"event":"unassigned","created_at":"2026-09-01T10:03:09Z","label":null,"milestone":null}
{"event":"assigned","created_at":"2026-09-01T10:03:09Z","label":null,"milestone":null}
{"event":"demilestoned","created_at":"2026-09-01T10:03:18Z","label":null,"milestone":"On Deck"}
{"event":"milestoned","created_at":"2026-09-01T10:03:18Z","label":null,"milestone":"1.138.0"}
{"event":"demilestoned","created_at":"2026-09-10T08:28:04Z","label":null,"milestone":"1.138.0"}
{"event":"milestoned","created_at":"2026-09-10T08:28:04Z","label":null,"milestone":"1.141.0"}
{"created_at":"2020-10-24T02:27:26Z","updated_at":"2026-09-10T08:28:04Z","issue_dependencies_summary":{"blocked_by":0,"total_blocked_by":0,"blocking":0,"total_blocking":0}}
```

- What follows: the last comment and the commits that referenced the issue are from January 2021;
  after that come labels, monthly milestone moves, a subscription, cross-references (from issues, and
  one pull request of another repository), a re-assignment and two milestone moves this September — and
  `updated_at` is the last milestone move. This is the shape the author's practice met: a planning
  session moves every leftover at once, and `updated_at` then says nobody's work is old. The digest
  computes activity from the timeline and never reads `updated_at`; the scenario's #208 and #191 have
  this shape.
- Decisions that depend on it: the activity rule; the scenario.

### F19: Redmine's issue JSON carries each attachment's size; a missing attachment is a 404 HTML page

- Measured on: 2026-10-02 / last re-measured: 2026-10-02
- Measured by: the author, on the public web (from the Windows PC), against redmine.org's own tracker
- Commands:

```
curl -sS -m 30 -D list.headers -o list.json 'https://www.redmine.org/issues.json?limit=25&sort=updated_on:desc&include=attachments'
curl -sS -m 30 -o issue-44567.json 'https://www.redmine.org/issues/44567.json?include=attachments,journals'
curl -sS -m 60 -L -o att-37006.bin -D att-37006.headers -w 'final http %{http_code}, %{size_download} bytes, redirects %{num_redirects}, type %{content_type}\n' 'https://www.redmine.org/attachments/download/37006/screen-row-highlighting.png'
curl -sS -m 30 -o /tmp/rm-404.bin -w 'missing: http %{http_code}, type %{content_type}, %{size_download} bytes\n' 'https://www.redmine.org/attachments/download/999999999/screenshot.png'
curl -sS -m 30 -o /tmp/rm-404j.bin -w 'missing json: http %{http_code}, type %{content_type}, %{size_download} bytes\n' 'https://www.redmine.org/issues/999999999.json'
jq -c '{total_count, n: (.issues|length)}' list.json
jq -r '.issue | keys | join(",")' issue-44567.json
jq -r '.issue.journals[0] | keys | join(",")' issue-44567.json
jq -c '.issue.attachments[] | select(.id==37006) | {id, filename, filesize, content_type, keys: (keys|join(","))}' issue-44567.json
grep -i -E '^(HTTP/|content-length|content-type|content-disposition)' att-37006.headers | tr -d '\r'
head -c 8 att-37006.bin | od -An -tx1
```

- Output (the three `-w` lines first, then the `jq`, `grep` and `od` lines):

```
final http 200, 108748 bytes, redirects 0, type image/png
missing: http 404, type text/html; charset=utf-8, 5947 bytes
missing json: http 404, type application/json, 0 bytes
{"total_count":4769,"n":25}
attachments,author,category,closed_on,created_on,description,done_ratio,due_date,estimated_hours,fixed_version,id,is_private,journals,priority,project,start_date,status,subject,total_estimated_hours,tracker,updated_on
created_on,details,id,notes,private_notes,user
{"id":37006,"filename":"screen-row-highlighting.png","filesize":108748,"content_type":"image/png","keys":"author,content_type,content_url,created_on,description,filename,filesize,id"}
HTTP/1.1 200 Connection established
HTTP/1.1 200 OK
content-disposition: attachment; filename="screen-row-highlighting.png"
content-length: 108748
content-type: image/png
 89 50 4e 47 0d 0a 1a 0a
```

- What follows: the metadata gives a size to compare the download with (this server sends no digest).
  A download that ignores the status saves the 5,947-byte error page under the name it asked for —
  the failure the fetcher refuses. A missing issue is a 404 with an empty body. Redmine serves its own
  files directly; a signed redirect to another host (as cloud trackers do) is the mock's addition.
- Decisions that depend on it: the fetcher; the mock tracker's shapes.

### F20: The fixtures, and the expected outcome of the GitHub scenario computed independently

- Measured on: 2026-10-02 / last re-measured: 2026-10-02
- Measured by: the author, on the Windows PC: the PNG generator and a reference computation of the
  digest's rules (both kept outside the repository; `fixtures/PROVENANCE.md` describes them)
- Commands:

```
node make-png-fixtures.mjs fixtures/tracker/files                 # prints name, size, sha256
node check-digest-expected.mjs fixtures/github/scenario.json      # prints a per-item table, then the lines kept below
```

- Output (the generator's tabs shown as spaces; the reference computation's per-item table left out —
  its rows are the expected-outcome table of SCOPE.md):

```
board-before.png   812  39ae80397eed9d46b448385be587018fcc0a31b4b2de2e05ae198b4645e95627
board-after.png    812  99b66246758c34aa8a99d79ab8e6dadcfbadd21148daf03a9c73f6df2a40ed8f
export-dialog.png  617  4d4b1b73790b4d26a4fe423b5373c6d3842383c4e9047402b57f2b3274ff4c10
notice.png         739  9c3acf9da6d30444d64fef71d04c6c5222808c55f1edc254e48cd35e19b8ef9b
wording.png        316  a398ab8aca6a272e160dead7cf8e4904b1acd4ccbf60e192d0b18fa841780871
partial.png        548  3d7e1ddc34f99e9edcfcaa7dc2e1f19945aac2ed909202de9a185b7d45bca058
export-log.zip (generated by the mock)  3145728  02e34249abc54aba2c06c3b8b35b7f4fc78ba9b10df5371e7d8372f50adbf44c

current Sprint 13 (#13), previous Sprint 12 (#12)
decisions #206 (60.4) #205 (45.8) #202 (23.6) #211 (15.4) #201 (11.4) #190 (0.4) #204 (0.4)
closed since [ 213 ] added since [ 204, 210 ]
open in current 13 / 15 carryover 2
```

- What follows: the two board screenshots have the same size and different bytes, so only a checksum
  tells them apart. The expected-outcome table of SCOPE.md is this computation's output; every row of
  it (lanes, idle days, scores) came out as the author had worked it by hand.
- Decisions that depend on it: the evals' expected values; the digest's tests.

### F21: The GitHub Actions the workflow may use, resolved to commits

- Measured on: 2026-10-01 / last re-measured: 2026-10-01
- Measured by: the author, from the Windows PC, with GitHub's REST API (`/releases/latest`, then
  `/git/ref/tags/<tag>`, dereferencing annotated tags) — for ci-devex-toolkit, the day before this pack
- Output:

```
actions/checkout           v7.0.1   3d3c42e5aac5ba805825da76410c181273ba90b1 (commit)
actions/setup-node         v7.0.0   820762786026740c76f36085b0efc47a31fe5020 (commit)
pnpm/action-setup          v6.1.0   ea17c68df8912ef543352723c149a84f56e3d413 (tag)
actions/upload-artifact    v7.0.1   043fb46d1a93c77aae656e7c1c64a875d1fc6a0a (commit)
```

- What follows: every `uses:` of this repository's workflow is one of these SHAs with the version as a
  comment. The run cannot reach GitHub; it does not look up or change them.
- Decisions that depend on it: `.github/workflows/ci.yml`.

### F22: On the Windows PC the same skeleton installs, and Biome checks only the code directories

- Measured on: 2026-10-02 / last re-measured: 2026-10-02
- Measured by: the author, on the Windows PC, in a scratch copy with planted files, including a
  malformed `.ts` file in each of `evals/.runs/`, `evals/x/results/` and `fixtures/`
- Commands:

```
pnpm install                       # last lines kept
pnpm exec biome check . --verbose  # the file list kept
pnpm typecheck; pnpm test          # last lines kept
```

- Output:

```
Done in 1.5s using pnpm v11.28.0
  - biome.json
  - evals\x\grade.ts
  - harness\h.ts
  - skills\skill-trigger-probe\scripts\add.ts
  - test\add.test.ts
  - vitest.config.ts
Checked 6 files in 5ms. No fixes applied.
$ tsc --noEmit
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

- What follows: the given Biome configuration covers `skills/`, `harness/`, `evals/` and `test/`, and
  skips the raw A/B area, the results and the fixtures.
- Decisions that depend on it: the given `biome.json`; the run's lint rows.
