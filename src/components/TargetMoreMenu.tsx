import { Ban, Clock } from 'lucide-react';
import React from 'react';
import { useTactileAudio } from '../hooks/useTactileAudio';
import { MoreMenu } from './MoreMenu';

interface TargetMoreMenuProps {
  streamer: string;
  onBan: (channelName: string, isSnooze2h: boolean) => void;
}

/** "…" menu of the current target: the two actions that take a streamer out of the farm, kept away from the everyday buttons. */
export const TargetMoreMenu: React.FC<TargetMoreMenuProps> = ({ streamer, onBan }) => {
  const { playClick } = useTactileAudio();

  // The actions name no streamer: if the farm moves to another one under an open menu, MoreMenu closes (resetKey) rather than ban the wrong channel
  return (
    <MoreMenu label="Ещё действия со стримером" resetKey={streamer}>
      {(close) => {
        const choose = (snooze: boolean) => {
          playClick();
          close();
          onBan(streamer, snooze);
        };
        return (
          <>
            <button className="more-item" role="menuitem" onClick={() => choose(true)} title="Поставить стримера на паузу на 2 часа">
              <span><Clock className="ui-icon" aria-hidden="true" focusable="false" /> Скрыть на 2 ч</span>
            </button>
            <button className="more-item" role="menuitem" onClick={() => choose(false)} title="Исключить стримера из фарма навсегда">
              <span><Ban className="ui-icon" aria-hidden="true" focusable="false" /> Исключить</span>
            </button>
          </>
        );
      }}
    </MoreMenu>
  );
};
