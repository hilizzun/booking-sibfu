#!/bin/sh
# changelog.sh: собирает CHANGELOG.md целиком из git-истории.
#
# Запуск:  sh scripts/changelog.sh
#
# Структура файла: сверху «Невыпущенное» (коммиты после последнего тега),
# ниже заголовки тегов с датой (новые сверху), у каждого блока три раздела
# в фиксированном порядке: Новое, Исправления, Документация.
#
# Коммит попадает в раздел по первому слову темы:
#   feat            → Новое
#   fix             → Исправления
#   docs            → Документация
#   refactor/test/chore/ci → в changelog не попадают
#
# Файл пересобирается от старого к новому, правки руками не сохраняются.
# Внутри раздела коммиты идут в хронологическом порядке.

set -e

cd "$(git rev-parse --show-toplevel)"

OUT=CHANGELOG.md
TEMP=$(mktemp)
RANGES=$(mktemp)
trap 'rm -f "$TEMP" "$RANGES"' EXIT

# --- Разбор одной темы коммита: тип и описание --------------------
# Печатает "<раздел>|<описание>|<хеш>" или ничего, если тип не для changelog.
parse_subject() {
  printf '%s' "$1" | awk '
    {
      subj = $0
      # тема: <тип>(<слой>): <описание>
      if (match(subj, /^(feat|fix|docs)(\([^)]*\))?: /)) {
        type = substr(subj, 1, index(subj, "(") > 0 ? index(subj, "(") - 1 : index(subj, ":") - 1)
        rest = substr(subj, RLENGTH + 1)
        if (type == "feat")   section = "Новое"
        if (type == "fix")    section = "Исправления"
        if (type == "docs")   section = "Документация"
        printf "%s|%s|%s\n", section, rest, hash
        exit
      }
      # тип без слоя: "docs: ..." (совместимость со старыми коммитами)
      if (match(subj, /^(feat|fix|docs): /)) {
        type = substr(subj, 1, index(subj, ":") - 1)
        rest = substr(subj, RLENGTH + 1)
        if (type == "feat")   section = "Новое"
        if (type == "fix")    section = "Исправления"
        if (type == "docs")   section = "Документация"
        printf "%s|%s|%s\n", section, rest, hash
      }
    }'
}

# --- Список коммитов диапазона: хеш, тема (хронологически) --------
# $1 — диапазон rev-list (например "v1.0.0..HEAD" или пусто = весь репозиторий)
commits() {
  git log --reverse --format='%h|%s' ${1:+"$1"}
}

# --- Печать одного блока: три раздела, пустые пропускаются --------
# $1 — заголовок раздела (заголовок версии или NULL для «Невыпущенное»),
# $2 — диапазон rev-list.
print_block() {
  BLOCK_TITLE="$1"
  RANGE="$2"

  COLLECTED=$(commits "$RANGE" | while IFS='|' read -r HASH SUBJECT; do
    HASH="$HASH" parse_one "$SUBJECT" "$HASH"
  done)

  [ -z "$COLLECTED" ] && return 0

  if [ "$BLOCK_TITLE" = "NULL" ]; then
    echo "## Невыпущенное"
  else
    echo "## $BLOCK_TITLE"
  fi
  echo ""

  for SECTION in "Новое" "Исправления" "Документация"; do
    ROWS=$(printf '%s\n' "$COLLECTED" | awk -F'|' -v s="$SECTION" '$1 == s { printf "- %s (`%s`)\n", $2, $3 }')
    [ -z "$ROWS" ] && continue
    echo "### $SECTION"
    echo ""
    printf '%s\n' "$ROWS"
    echo ""
  done
}

parse_one() {
  parse_subject "$1" | awk -v hash="$2" -F'|' '{ print $1 "|" $2 "|" hash }'
}

# --- Сборка -------------------------------------------------------

LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || true)

{
  echo "# Журнал изменений"
  echo ""
  echo "Файл собирается из git-истории командой \`sh scripts/changelog.sh\`."
  echo "Раздел выбирается по типу коммита: \`feat\` → Новое, \`fix\` → Исправления,"
  echo "\`docs\` → Документация; \`refactor\`, \`test\`, \`chore\`, \`ci\` не попадают."
  echo ""

  if [ -n "$LAST_TAG" ]; then
    print_block "NULL" "$LAST_TAG..HEAD"

    # Версии: сверху новая. Сначала считаем диапазоны от старых тегов к новым
    # (границы каждой версии: предыдущий тег..текущий), затем печатаем в
    # обратном порядке, чтобы новые версии шли сверху.
    PREV_TAG=""
    for TAG in $(git tag --sort=creatordate); do
      if [ -n "$PREV_TAG" ]; then
        RANGE="$PREV_TAG..$TAG"
      else
        RANGE="$TAG"
      fi
      printf '%s|%s\n' "$TAG" "$RANGE" >> "$RANGES"
      PREV_TAG="$TAG"
    done

    awk '{ a[NR] = $0 } END { for (i = NR; i > 0; i--) print a[i] }' "$RANGES" |
    while IFS='|' read -r TAG RANGE; do
      TAG_DATE=$(git log -1 --format=%as "$TAG")
      print_block "[$TAG] - $TAG_DATE" "$RANGE"
    done
  else
    print_block "NULL" ""
  fi
} > "$TEMP"

mv "$TEMP" "$OUT"
echo "Собран $OUT из git-истории."