import { knowledgeArticles } from '../mocks/knowledge.ts'

export const maxQuestionLength = 600
export interface AssistantAnswer {
  kind: 'answer' | 'refusal' | 'clarification'
  text: string
  sourceIds: string[]
}
export interface ChatTurn {
  id: string
  question: string
  answer: AssistantAnswer
}

const stopWords = new Set(
  'а без бы был была были в вам вас ваш ваша ваши весь во вот вы где да для до его ее если еще же за зачем здесь и из или их к как какая какие какой какую когда кто ли мне меня можно мой моя мои мою моей моем моих моего мы на над надо нам нас наш не него нее нет но о об от по под пожалуйста подскажи подскажите покажи покажите помоги помогите почему при про с сам себе сколько со спасибо так также там то тогда только у уже узнать хочу чем через что чтобы это этой этом этот эту я расскажи расскажите объясни объясните вопрос нужно привет здравствуйте'.split(
    ' ',
  ),
)

const noAnswer: AssistantAnswer = {
  kind: 'refusal',
  text: 'В тестовой базе нет подтверждённого ответа на этот вопрос. Я не буду придумывать условия, суммы или персональные данные. Попробуйте задать вопрос о работе кабинета. За правилами компании и индивидуальным решением обратитесь в HR через привычный рабочий канал. Контакты HR в тестовой базе не указаны; сообщение из этого чата не отправляется.',
  sourceIds: [],
}

function normalize(value: string) {
  return value.toLowerCase().replaceAll('ё', 'е')
}

// Deterministic, conservative retrieval. Only exact document text is returned.
// No model, execution of user instructions, workflow state or network access.
export function answerQuestion(question: string): AssistantAnswer {
  if (!question.trim() || question.length > maxQuestionLength)
    return { ...noAnswer }
  const normalized = normalize(question)
  const words = normalized.match(/[a-zа-я0-9]+/g) ?? []
  const meaningful = words.filter((word) => !stopWords.has(word))
  if (!meaningful.length) return { ...noAnswer }
  // These topics are deliberately absent. In particular, отпускные are not отпуск.
  if (
    words.some((word) =>
      /отпускн|зарплат|компенсац|преми|декрет|закон|больнич|парол/.test(word),
    )
  )
    return { ...noAnswer }
  if (
    words.some((word) =>
      /^(отзови|одобри|отклони|создай|отправь|измени|удали|запиши|согласуй|начисли|заплати|оформи|исправь)(те)?$/.test(
        word,
      ),
    )
  ) {
    return {
      kind: 'refusal',
      text: 'Я могу объяснить работу кабинета по тестовым инструкциям, но не выполняю действия с заявками или профилем. Откройте нужный раздел кабинета или спросите, как выполнить действие самостоятельно.',
      sourceIds: [],
    }
  }

  const matches = knowledgeArticles.filter(
    (article) =>
      article.required.every((pattern) => pattern.test(normalized)) &&
      meaningful.every((word) => article.vocabulary.test(word)),
  )
  if (matches.length === 1) {
    const article = matches[0]
    return {
      kind: 'answer',
      text: article.paragraphs.join('\n\n'),
      sourceIds: [article.id],
    }
  }
  if (
    matches.length > 1 ||
    (meaningful.length === 1 &&
      /^(отпуск|заявки?|обучение|курсы?|тест|профиль|уведомления|прогресс)$/.test(
        meaningful[0],
      ))
  ) {
    return {
      kind: 'clarification',
      text: 'Уточните, пожалуйста, что хотите узнать. Например: как оформить отпуск, где посмотреть историю заявки или какой проходной балл у теста. Задайте один вопрос за раз — так я смогу сослаться на конкретную статью.',
      sourceIds: [],
    }
  }
  return { ...noAnswer }
}
