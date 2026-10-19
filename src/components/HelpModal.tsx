import React from 'react';
import { X, ShieldCheck, Check } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Закрыть">
          <X size={20} />
        </button>
        <div className="section-icon mint">
          <ShieldCheck size={24} />
        </div>
        <h2>Всё просто. Всё под контролем.</h2>
        <p>Горячие клавиши и управление автономным стражем Sentinel.</p>
        
        <div className="shortcut-row">
          <span>Обновить данные и статус Twitch</span>
          <kbd>F5</kbd>
        </div>
        <div className="shortcut-row">
          <span>Закрыть модальное окно</span>
          <kbd>Esc</kbd>
        </div>

        <div className="modal-info">
          <ShieldCheck size={20} />
          <p>
            Sentinel работает в нативном режиме Windows: фоновый опрос ведется через чистый WebSocket без скачивания видеопотока. При запуске игр Hardware Guard мгновенно переводит сбор в безопасную паузу.
          </p>
        </div>

        <button className="start-button" onClick={onClose}>
          Всё понятно <Check size={16} />
        </button>
      </section>
    </div>
  );
};
