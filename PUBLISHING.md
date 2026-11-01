# Публикация

Репозиторий: https://github.com/Volaheck/flappy-coding-break

## Проверка выпуска

1. Согласовать версию в `package.json`, `.claude-plugin/plugin.json` и `.codex-plugin/plugin.json`.
2. Обновить `CHANGELOG.md`.
3. Запустить `npm run build`, `npm test`, `npm run check:generated`, `npm run test:claude`, `npm pack --dry-run`. Проверка Claude использует закреплённую версию официального CLI и отдельный временный профиль.
4. Проверить содержимое пакета: общий код, готовый OpenCode bundle, Claude mod, Codex MCP server/HTML bundle, установщик, skills и оба marketplace.
5. Проверить реальные приложения: загрузку OpenCode, `/flappy` в Claude Terminal/Desktop, `open_flappy` в Codex Desktop с MCP Apps UI. Проверить смену статуса, несколько чатов, ручное закрытие, паузу и завершение партии. Mock/API-тесты не заменяют проверку UI хоста.
6. Проверить установку в чистом профиле. Codex требует явного доверия хукам; установщик не должен обходить эту проверку.

## GitHub

Объединить проверенные изменения в `main`, создать тег версии и опубликовать его. Команда `npx github:Volaheck/flappy-coding-break install --all` берёт установщик из default branch, затем каждый менеджер плагинов устанавливает проект из GitHub. Поэтому multi-harness исходники и готовые bundles должны уже находиться в этой ветке.

Для проверки ветки до слияния:

```sh
node bin/flappy.js install --codex --claude --source .
node bin/flappy.js install --opencode --opencode-source github:Volaheck/flappy-coding-break#feature/multi-harness
```

Вторая команда требует опубликованную ветку. Для OpenCode также можно указать локальную папку в глобальном конфиге. Не передавай временную папку `npx` как постоянный marketplace.

## npm

Пакет сохраняет имя `opencode-flappybird`, экспорт `./gui-experimental` и добавляет executable `flappy-coding-break`.

После проверки владельца пакета и входа в npm:

```sh
npm publish --access public
```

Публикация npm — отдельное действие; сборка или GitHub push её не выполняют. `prepack` пересобирает готовые файлы. Если используется GitHub-установка, npm-публикация не требуется.

## Каталоги

Claude использует `.claude-plugin/marketplace.json`, Codex — `.agents/plugins/marketplace.json`. Оба ссылаются на корень одного репозитория и плагин `flappy-coding-break`.

Codex-версия содержит локальные lifecycle hooks. Согласно текущим правилам OpenAI такие плагины распространяются через ручную/local marketplace установку и не подходят для публичного каталога с hooks. Не заявляй публикацию в каталоге OpenAI без отдельной проверки требований.

## Обновления

Обновляй плагины штатными менеджерами каждого приложения. После изменения хуков Codex может потребовать повторную проверку доверия. Схемы интерфейсов экспериментальные: при обновлении хостов перепроверяй native rendering и отражай ограничения в обеих версиях README.
