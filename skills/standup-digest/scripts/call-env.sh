#!/usr/bin/env bash
# The wrapper this skill's narration call goes through when CLAUDE_CALL_ENV_FILE is set.
#
#   bash call-env.sh <env-file> <env-args...> <command> <args...>
#
# It sources the file, then hands everything else to `env`, so the caller's overrides are applied
# AFTER the file and the file cannot undo them. A skill directory stands alone, so this is this
# skill's own copy and not the trigger probe's — deliberately duplicated, four lines of it.
set -u
file="$1"
shift
# shellcheck disable=SC1090
. "$file"
exec env "$@"
