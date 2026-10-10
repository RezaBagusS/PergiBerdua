import {useEffect, useId, useRef, type ReactNode} from 'react';
export default function Modal({title, busy, error, onClose, children}: {
  title:string;busy:boolean;error:string;onClose:()=>void;children:ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {dialog?.close(); previous?.focus();};
  }, []);
  return <dialog ref={ref} aria-labelledby={heading} aria-busy={busy} onCancel={e => {e.preventDefault();if(!busy)onClose();}}>
    <div className="modal-head"><h2 id={heading}>{title}</h2><button type="button" className="icon-button" disabled={busy} onClick={onClose} aria-label="Tutup">×</button></div>
    {children}
    {error && <p className="error" role="alert">{error}</p>}
  </dialog>;
}
