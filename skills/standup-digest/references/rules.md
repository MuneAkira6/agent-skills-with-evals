# The rules

Every number on the page comes from here. `today` is the date of `now` in the configured time zone,
and a number of days is `floor((now − t) ÷ 24 h)`. **`updated_at` is never used for anything.**

## Activity

The evidence that somebody worked on an item: the item's creation, and these timeline events —

`commented` (`created_at`), `committed` (`committer.date`, because it has no `created_at`),
`reviewed` (`submitted_at`), `closed`, `reopened`, `renamed`, `referenced`, `ready_for_review`,
`convert_to_draft`, `merged`, `head_ref_force_pushed`;

`cross-referenced` **only** when its source is a pull request of the same repository;
`labeled` / `unlabeled` **only** for a waiting or in-progress label.

Everything else — `milestoned`, `demilestoned`, `assigned`, `unassigned`, `review_requested`,
`mentioned`, `subscribed`, any other label, and any event not named above — is planning or noise.

`idle_days` is the days since the latest activity.

## Pull requests

An item's linked pull requests are the sources of its qualifying `cross-referenced` events; an item
that is itself a pull request is linked to itself.

A pull request is **approved** when, taking each reviewer's latest review whose state is `APPROVED`
or `CHANGES_REQUESTED`, at least one is `APPROVED` and none is `CHANGES_REQUESTED`. A comment-only
review says nothing either way.

A pull request is **waiting for review** when it is open, not a draft and not approved — since its
latest `ready_for_review` event, or its creation. `review_days` is the largest number of days any of
an item's waiting pull requests has waited.

## Waiting

When the item carries a waiting label, `waiting_days` counts from the latest `labeled` event for a
waiting label it **still** carries, or its creation if there is none. Otherwise it is 0.

## Lanes

Each open item gets exactly one, in this order:

| Lane | Condition |
| --- | --- |
| ⏸️ silent | `idle_days` ≥ `silentDays` |
| 🔴 waiting | a waiting label, or a pull request waiting for review |
| 🚧 in progress | an in-progress label, or an open draft pull request |
| 💤 stale | `idle_days` ≥ `staleDays` |
| 🙊 quiet | everything else |

## Decisions

For an item that is **not silent**, a trigger fires when:

| Trigger | Condition | The question |
| --- | --- | --- |
| `carryover` | it is a carry-over item | 今のマイルストーンに入れるか閉じるか |
| `waiting` | `waiting_days` ≥ `waitingDecisionDays` | 催促するか外すか |
| `review` | `review_days` ≥ `reviewDecisionDays` | 誰がいつレビューするか |
| `unassigned` | no assignee | 担当を決めるか外すか |

An item is a **decision** when at least one trigger fires **and** it has no assignee or at least one
assignee among the members. The number of decisions is whatever the rules give; none at all is a
correct result and the page says so.

## Order

Descending score, ties by older creation, then lower number.

```
age   = max(3 × min(waiting_days, cap), 2 × min(review_days, cap))
age   = age × 0.5   when max(waiting_days, review_days) ≥ chronicDays
score = age + 5 (a pull request waiting for review) + 2 (blocked_by > 0)
            + min(idle_days, cap) ÷ 5
```

The `max` is not a simplification: an item waiting for an answer and for a review is **one** stall,
and adding the two counted it twice. The discount is there because an item that has been waiting two
months has been offered to the stand-up many times already, and putting it first again changes
nothing.

### The two switches in `scoreOf`, and what they are not

`scoreOf` takes an optional third argument with `chronicDiscount` and `sumInsteadOfMax`. **These are
the evaluation's switches, not configuration.** They exist so that the two deliberate choices above
can be shown to matter: a test turns the discount off and watches the ranking change (#205 scores
90.8 instead of 45.8 and takes first place), and turns the `max` into a sum and watches one stall get
counted twice (35 becomes 55).

Nothing in the pipeline ever passes them — `buildItem` calls `scoreOf(core, config)` with two
arguments — and `digest.config.json` has no key for either. If you are tempted to use them to change
how your stand-up ranks, change the thresholds instead: `capDays` and `chronicDays` are the
configuration, and the shape of the formula is not.

## Hygiene

For people to fix, never a lane: open items with no assignee, and open items carrying both a waiting
and an in-progress label.
