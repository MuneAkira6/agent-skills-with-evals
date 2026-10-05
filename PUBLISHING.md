# 公開の手順

このリポジトリを GitHub に公開するときの説明文、トピック、そして公開前の確認事項です。

## GitHub の説明文（案）

> Claude Code のスキル 3 本と、その評価スイート。起動率のプローブ、添付の検証付き取得、GitHub
> マイルストーンからの朝会ダイジェスト。数字はすべて実際の CLI 実行から取っています。

英語版の案:

> Three Claude Code skills, each with an eval suite: a trigger-rate probe and frontmatter validator,
> a Redmine issue fetcher that verifies every attachment, and a stand-up digest from a GitHub
> milestone. Every number comes from a real run of the CLI.

## トピック（案）

`claude-code` / `agent-skills` / `skill` / `evaluation` / `eval-harness` / `typescript` / `nodejs` /
`vitest` / `redmine` / `github-api` / `mock-server` / `japanese`

## 公開前の確認事項

### 1. 秘密情報の走査

**走査の対象はコード、テスト、結果ファイルです。** パターンは文字クラスで書きます
（`sk-an[t]-`、`gh[pousr]_`、`github_pa[t]_`）。リテラルの接頭辞をリポジトリに置かないのは、
まさにこの走査を汚さないためです。

```bash
S="skills harness test evals docs .github goal-pack *.md"
rg -n 'sk-an[t]-[A-Za-z0-9_-]{8,}'           $S   # 1
rg -n 'gh[pousr]_[A-Za-z0-9]{8,}'            $S   # 2
rg -n 'github_pa[t]_[A-Za-z0-9_]{8,}'        $S   # 3
rg -n '://[^/[:space:]"]*:[^/[:space:]@"]*@' $S   # 4
```

`goal-pack/` **is** in the scope: every file in it would be committed
(`git check-ignore` reports none of them ignored; only the bus's dot-files are), so a scan that
skipped it would not be checking the published repository.

**1・2・3 本目は 1 件も出しません。** `goal-pack/SCOPE.md` には規則の本文として `sk-ant-` という
文字列がありますが、その後ろは文字数のある鍵ではなくバッククォートなので、`{8,}` を要求する
1 本目には一致しません（`rg -c 'sk-an[t]-[A-Za-z0-9_-]{8,}' goal-pack/SCOPE.md` → 一致なし）。

**4 本目だけが 4 行を出します。漏洩ではありません。** 除外せずに列挙してあるのは、除外の書き方を
覚えると本物の一致も隠れるからです。

この表の中の例は、`/ho[m]e/` と同じように**自分自身に一致しない書き方**にしてあります。4 本目の
パターンは `://` を必ず必要とするので、**スキーム（`http://`）を省いて書けば一致しません**。
はじめはこの手順書自身の一致も 1 行として数えようとしたのですが、実際に走査すると
**説明のために引用した 3 行が新たな一致として出てきました**。説明が文字列をそのまま引用する限り
列挙は収束しないので、ここだけはこの書き方にしています。除外ではありません——このファイルからは
一致が 1 件も出ないので、読み手が照合する行は下の 4 行だけです。

| 4 本目が出す行 | それが何か |
| --- | --- |
| `goal-pack/BUS-REVIEWS.md:376` | ダミー `alice:topsecret123@gateway.invalid` について書かれたレビュー本文。実行の記録なので、書かれたまま残してあります。 |
| `goal-pack/PROGRESS.md:97` | AC-9 の証拠が引用している `alice:[redacted]@` ——**伏せた後の形**です。資格情報ではありません。 |
| `test/redact.test.ts:48` | 伏せ字の規則を確かめるダミー（`alice:topsecret123@gateway.invalid:8080/x`）。**これが一致しなくなったら、規則そのものが壊れています。** |
| `test/redact.test.ts:49` | その期待値、つまり伏せた後の形（`alice:${REDACTED}@`）。 |

- [ ] 1・2・3 本目が何も出さないこと。
- [ ] 4 本目が出す行が、上の 4 行だけであること（行番号は 2026-10-05 時点。ずれていたら
      ファイル名と内容で照合してください）。
- [ ] 一致した行がいずれも**値ではなく規則かダミー**であること。
- [ ] `skills/`、`harness/`、`evals/*/results/` には 4 本すべてで一致が 1 件もないこと。

### 2. 機械が持っているパスが結果に入っていないこと

```bash
# パターンを文字クラスで書くのは、この手順書自身が一致しないようにするためです
rg -n '/ho[m]e/' skills harness test evals docs .github README.md
rg -c '/tmp/' evals/*/results
```

- [ ] `/ho[m]e/` の一致がないこと（この手順書を対象から外す必要はありません）。
- [ ] `/tmp/` の一致が、`run.json` の `wsPath`（契約が記録を求めている腕の作業ディレクトリ）と、
      汚染フラグが引用している腕自身のコマンドだけであること。

### 3. 署名付き URL のトークンについて

`evals/*/results/ab-*/**/run.json` は、モックのメディアホストが発行したトークンの**値**を記録します
（契約が「メディアホストが発行したトークン」を求め、評価の判定 M3・M5 がその値を必要とするため）。
公開される値は 32 桁の 16 進数で、すでに存在しないサーバーが 300 秒だけ有効にしたダミーです。

- [ ] この A/B ランナーを**本物の**署名付き URL を出すサービスに向けるなら、公開前に
      `harness/ab/mocks.ts` の `issuedTokens` を値ではなく件数に変えること。そうしないと本物の
      資格情報がコミットされた結果に残ります。

### 4. 生の記録がコミットされていないこと

```bash
git status --short evals
git check-ignore -v evals/.runs
```

- [ ] `evals/.runs/` が無視されたままで、コミット対象に入っていないこと。
- [ ] `out/` も同様（デモの出力先）。

### 5. README のリンク

- [ ] 事例へのリンクが開けること:
      https://github.com/MuneAkira6/engineering-case-studies/blob/main/06-ai-in-daily-engineering.md
- [ ] 公開仕様へのリンクが開けること（agentskills.io、platform.claude.com）。
- [ ] `docs/reading-evals.md` と `goal-pack/` へのリンクが相対パスで正しいこと。

### 6. Actions の固定

```bash
grep -n 'uses:' .github/workflows/ci.yml
```

- [ ] `uses:` がすべて SHA で、バージョンがコメントにあること
      （`actions/checkout` v7.0.1、`pnpm/action-setup` v6.1.0、`actions/setup-node` v7.0.0）。
- [ ] `corepack enable` がどこにもないこと。
- [ ] `permissions: contents: read` があること。

### 7. 測定した版と公開する版が同じこと

- [ ] 3 つの `SKILL.md` の sha256 が、結果ファイルを取ったときのものと同じであること。
      説明文を 1 文字でも直したら、起動率はその版のものではなくなります。

```bash
sha256sum skills/*/SKILL.md
# 3f6e353e5ab8545343718a28f2842b6d24615615d7dc39aacf3138a44d8cd251  skills/skill-trigger-probe/SKILL.md
# b2559a5bc3710209dbed4d6b8fda781c32a2319f9e9520f0a49a45f95f8e95f4  skills/standup-digest/SKILL.md
# da68a50a496255b3ca6bfc70d383bc5f1e5de79f020bee35c95670123958a054  skills/verifiable-fetch/SKILL.md
```

### 8. オフラインで通ること

```bash
pnpm i && pnpm test && pnpm lint && pnpm typecheck && pnpm skills:validate
```

- [ ] `claude` を一度も呼ばずに全部通ること。
