import Modal from './Modal'

export default function ConfirmDialog({ open, onClose, onConfirm, title, message, danger, confirmLabel }) {
  return (
    <Modal open={open} onClose={onClose} title={title || 'Confirmar'} size="sm">
      <p className="text-gray-300 mb-6 text-sm">{message}</p>
      <div className="flex gap-3 justify-end">
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={() => { onConfirm(); onClose() }}>
          {confirmLabel || 'Confirmar'}
        </button>
      </div>
    </Modal>
  )
}
