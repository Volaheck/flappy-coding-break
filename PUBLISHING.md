# Публикация

Инструкция для того, кто будет публиковать. Файл не попадает в npm-пакет.

## 1. Заполнить данные репозитория

- `package.json`: добавить `repository`, `homepage`, `bugs` и при желании `author`
  ```json
  "repository": { "type": "git", "url": "git+https://github.com/OWNER/REPO.git" },
  "homepage": "https://github.com/OWNER/REPO#readme",
  "bugs": { "url": "https://github.com/OWNER/REPO/issues" }
  ```
- `README.md` и `README.ru.md`: заменить `OWNER/REPO` в команде установки из GitHub
- `LICENSE`: при необходимости указать правообладателя вместо `opencode-flappybird contributors`

## 2. Git и GitHub

- Скопировать папку к себе, например `cp -R /Users/softcorp/Public/opencode-flappybird ~/`, и работать с копией.
- Перед первым коммитом проверить `git config user.name` и `git config user.email`.
- Создать публичный репозиторий, закоммитить файлы, запушить, поставить тег `v1.0.0`.

## 3. npm

- Имя `opencode-flappybird` на 30.10.2026 было свободно, проверьте ещё раз: `npm view opencode-flappybird`
- Войти в npm: `npm login`, проверить `npm whoami`
- `npm publish --access public`
- В пакет попадают `gui-experimental.cjs`, `package.json`, `README.md`, `LICENSE`, проверить можно через `npm pack --dry-run`

## 4. Проверка установки

- `opencode plugin add opencode-flappybird`
- `opencode plugin list` должен показать `opencode-flappybird`, в Desktop плагин появится в **Settings → Extensions → Plugins**

## 5. Каталоги

- opencode.im: подхватит автоматически благодаря ключевому слову `opencode-plugin` и примеру установки в README, или вручную через https://opencode.im/submit
- awesome-opencode: pull request в https://github.com/awesome-opencode/awesome-opencode
- opencode.cafe: https://opencode.cafe/submit
- Страница Ecosystem в документации OpenCode: pull request в `anomalyco/opencode`, файл `packages/web/src/content/docs/ecosystem.mdx`

## 6. Обновления

- Поднять версию в `package.json`, дописать `CHANGELOG.md`, `npm publish`, поставить git-тег
- Пользователи обновляются командой `opencode plugin update`
