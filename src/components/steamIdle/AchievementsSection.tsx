import React from 'react';
import { SteamIdleAchievements, SteamIdleState } from '../../types';
import { AchAllGames } from './AchAllGames';
import { AchFinished } from './AchFinished';
import { AchGate } from './AchGate';
import { AchInterrupted } from './AchInterrupted';
import { AchOneGame } from './AchOneGame';
import { AchPace } from './AchPace';
import { AchRunPanel } from './AchRunPanel';
import { achRunActive } from './achievementsText';
import { UnavailablePanel } from './SteamIdleParts';
import { useArrivals, useBusyRetry, useLibraryGames } from './useAchievementsData';
import { SendCommand, SteamIdleCommand } from './useSteamIdle';

type Props = { s: SteamIdleState; ach: SteamIdleAchievements; busy: SteamIdleCommand | null; send: SendCommand };

const isReady = (status: string | undefined) => status === 'ready';

/** Mounted only once achievements are acknowledged, so nothing is read from the service before that. */
const Workspace: React.FC<Props & { takeFocus: boolean }> = ({ s, ach, busy, send, takeFocus }) => {
  const status = s.library.status ?? (s.library.count !== null ? 'ready' : 'none');
  // A finished scan makes the list we hold out of date: read it again.
  const scans = useArrivals<string>(status, isReady);
  const library = useLibraryGames(status === 'ready', scans);
  const runActive = achRunActive(ach.run.state);
  useBusyRetry(library, runActive);
  return (
    <>
      <AchInterrupted interrupted={ach.interrupted} runActive={runActive} busy={busy} send={send} />
      <AchRunPanel s={s} run={ach.run} busy={busy} takeFocus={takeFocus} send={send} />
      <AchOneGame s={s} ach={ach} library={library} busy={busy} send={send} />
      <AchPace saved={ach.settings} runActive={runActive} busy={busy} send={send} />
      <AchAllGames s={s} games={library.data} runActive={runActive} busy={busy} send={send} />
      <AchFinished finished={ach.run.finished} />
    </>
  );
};

/** The Achievements section: the general risk gate decides first (its own screen is in the Cards section), then the achievements gate, then the work. */
export const AchievementsSection: React.FC<Props> = ({ s, ach, busy, send }) => {
  const gateSeen = React.useRef(false);
  const gate = s.available && s.riskAcknowledged && !ach.acknowledged;
  React.useEffect(() => { if (gate) gateSeen.current = true; }, [gate]);
  if (!s.available) return <UnavailablePanel s={s} />;
  if (!s.riskAcknowledged) return <p className="sidle-text" role="status">Сначала подтвердите общий риск в разделе «Карточки».</p>;
  if (!ach.acknowledged) return <AchGate busy={busy} send={send} />;
  return <Workspace s={s} ach={ach} busy={busy} send={send} takeFocus={gateSeen.current} />;
};
