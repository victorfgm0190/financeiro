import Modal from './Modal'

// `children` (opcional): conteúdo extra entre a mensagem e os botões (ex.: uma escolha).
export default function ConfirmDialog({ open, onClose, onConfirm, title, message, danger, confirmLabel, cancelLabel, children }) {
  return (
    <Modal open={open} onClose={onClose} title={title || 'Confirmar'} size="sm">
      <p className={`text-texto-2 text-sm ${children ? 'mb-3' : 'mb-6'}`}>{message}</p>
      {children && <div className="mb-6">{children}</div>}
      <div className="flex gap-3 justify-end">
        <button className="btn-secondary" onClick={onClose}>{cancelLabel || 'Cancelar'}</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={() => { onConfirm(); onClose() }}>
          {confirmLabel || 'Confirmar'}
        </button>
      </div>
    </Modal>
  )
}
