import type { StorageStatus } from '../utils/storage'
import { Icon } from './Icon'

const messages: Record<StorageStatus, string> = {
  saved: 'Демо-данные сохранены в этом браузере',
  invalid:
    'Сохранённые данные не удалось прочитать. Открыт исходный пример; старое сохранение не перезаписано. Для нового старта сбросьте демо-данные.',
  incompatible:
    'Сохранение другой версии. Открыт исходный пример без перезаписи. Для нового старта сбросьте демо-данные.',
  unavailable:
    'Сохранение в браузере недоступно. Изменения остаются только в этой вкладке. Проверьте настройки браузера и обновите страницу.',
  'write-error':
    'Не удалось сохранить изменения в браузере. Они пока доступны только в этой вкладке; предыдущее сохранение осталось на месте.',
  conflict:
    'Демо-данные изменились в другой вкладке. Эта вкладка не перезаписывает сохранение. Загрузите сохранённые данные; несохранённые изменения этой вкладки будут потеряны.',
}

export function DemoStorageBar({
  status,
  blocked,
  onReset,
  onRetry,
}: {
  status: StorageStatus
  blocked: boolean
  onReset: () => void
  onRetry: () => void
}) {
  return (
    <section
      className={`demo-storage-bar ${status === 'saved' ? '' : 'has-error'}`}
      aria-label="Сохранение демо-данных"
    >
      <p role={status === 'saved' ? 'status' : 'alert'}>
        <Icon name={status === 'saved' ? 'check' : 'clock'} size={15} />
        {messages[status]}
      </p>
      <div>
        {status === 'write-error' && !blocked && (
          <button onClick={onRetry}>Повторить сохранение</button>
        )}
        {(status === 'conflict' ||
          status === 'unavailable' ||
          (status === 'write-error' && blocked)) && (
          <button onClick={() => window.location.reload()}>
            Загрузить сохранённые данные
          </button>
        )}
        <button onClick={onReset}>Сбросить демо-данные</button>
      </div>
    </section>
  )
}
