#!/usr/bin/env bash
# The wrapper every nested `claude` of this repository goes through when CLAUDE_CALL_ENV_FILE is set.
#
#   bash call-env.sh <env-file> <env-args...> <command> <args...>
#
# It sources the file, then hands everything else to `env`, so the caller's overrides are applied
# AFTER the file and the file cannot undo them. The CLI does not pass its own credential to the
# tools of the session that runs this code (fact F9), and this is how a nested call authenticates
# on such a machine (F10). The file is only ever sourced here, in this child shell, and nothing of
# this shell's environment is printed.
set -u
file="$1"
shift
# shellcheck disable=SC1090
. "$file"
exec env "$@"
