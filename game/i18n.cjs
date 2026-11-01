"use strict"

const messages = {
    en: {
      title: "Flappy Bird",
      "command.toggle": "Play Flappy Bird",
      start: "Click to start",
      keys: "Space or ↑ to flap · P to pause",
      best: "Best",
      score: "Score",
      medal: "Medal",
      record: "NEW",
      over: "Game Over",
      restart: "Click or Space to play again",
      paused: "Paused",
      resume: "Click or Space to continue",
      "status.running": "Agent is working…",
      "status.done": "Agent is done",
    },
    ru: {
      title: "Flappy Bird",
      "command.toggle": "Играть во Flappy Bird",
      start: "Кликни, чтобы начать",
      keys: "Пробел или ↑ — взмах · P — пауза",
      best: "Рекорд",
      score: "Счёт",
      medal: "Медаль",
      record: "НОВЫЙ",
      over: "Игра окончена",
      restart: "Клик или пробел — ещё раз",
      paused: "Пауза",
      resume: "Клик или пробел — продолжить",
      "status.running": "Агент работает…",
      "status.done": "Агент закончил",
    },
  }

function translate(locale = "en") {
  const table = messages[String(locale).toLowerCase().startsWith("ru") ? "ru" : "en"]
  return (key) => table[key] ?? messages.en[key] ?? key
}

module.exports = { messages, translate }
