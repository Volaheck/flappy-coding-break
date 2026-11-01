"use strict"

const messages = {
    en: {
      title: "Flappy Bird",
      "command.toggle": "Play Flappy Bird",
      start: "Click to start",
      keys: "Space or ↑ to flap · P to pause",
      best: "Best",
      score: "Score",
      record: "New record!",
      bestScore: "Best score",
      over: "Game Over",
      finished: "Round complete",
      waiting: "Play again when the agent starts working",
      restart: "Click or Space to play again",
      paused: "Paused",
      resume: "Click or Space to continue",
      "status.running": "Agent is working…",
      "status.done": "Agent is done",
      "status.idle": "Waiting for the agent",
      "phrases.zero": [
        "Even the best ducks start at zero. Give it another try!",
        "Quack it up! Zero today, hero tomorrow!",
        "Oops! Flying takes practice — keep flapping!",
        "No luck this time. Retry and watch your skills grow!",
      ],
      "phrases.normal": [
        "Not bad! Every flap counts!",
        "Quack on! Practice makes a masterful duck!",
        "Keep going! Even little ducks learn to soar!",
        "Small steps now, big flights ahead!",
      ],
      "phrases.good": [
        "Wow! You're soaring high!",
        "Quack-credible flight!",
        "You're unstoppable! What a pilot!",
        "Amazing result! The sky is yours!",
      ],
      "phrases.record": [
        "Quack-tastic! A new personal best!",
        "Your wings are getting stronger — new record!",
        "Flying higher than ever! Best score yet!",
        "Amazing! You've outdone yourself!",
      ],
    },
    ru: {
      title: "Flappy Bird",
      "command.toggle": "Играть во Flappy Bird",
      start: "Кликни, чтобы начать",
      keys: "Пробел или ↑ — взмах · P — пауза",
      best: "Рекорд",
      score: "Счёт",
      record: "Новый рекорд!",
      bestScore: "Лучший счёт",
      over: "Игра окончена",
      finished: "Партия завершена",
      waiting: "Новая игра — когда агент начнёт работу",
      restart: "Клик или пробел — ещё раз",
      paused: "Пауза",
      resume: "Клик или пробел — продолжить",
      "status.running": "Агент работает…",
      "status.done": "Агент закончил",
      "status.idle": "Ждём агента",
      "phrases.zero": [
        "Даже лучшие утки начинали с нуля. Попробуй ещё раз!",
        "Кря! Сегодня ноль — завтра рекорд!",
        "Ой! Летать нужно учиться — маши крыльями!",
        "Не повезло. Ещё попытка — и всё получится!",
      ],
      "phrases.normal": [
        "Неплохо! Каждый взмах на счету!",
        "Кря-кря! Практика делает из утки аса!",
        "Так держать! Даже утята учатся парить!",
        "Маленькие шаги — большие полёты впереди!",
      ],
      "phrases.good": [
        "Ого! Высоко паришь!",
        "Кря-потрясающий полёт!",
        "Не остановить! Вот это пилот!",
        "Отличный результат! Небо твоё!",
      ],
      "phrases.record": [
        "Кря-фантастика! Новый личный рекорд!",
        "Крылья крепнут — новый рекорд!",
        "Выше, чем когда-либо! Лучший результат!",
        "Потрясающе! Новая вершина!",
      ],
    },
  }

function translate(locale = "en") {
  const table = messages[String(locale).toLowerCase().startsWith("ru") ? "ru" : "en"]
  return (key) => table[key] ?? messages.en[key] ?? key
}

module.exports = { messages, translate }
