import React from 'react';
import { Modal } from './Modal';
import { Kbd } from './ui';
import { ROUTES } from '../routes';

const GLOSSARY: [string, string][] = [
  ['Simulation clock', 'The demo campaign runs on its own operational date, which moves forward one working day each time you advance the workday. Real campaigns use today’s date.'],
  ['Adaptive QA', 'Instead of reviewing the same share of everyone’s work, review effort follows each annotator’s QA record: proven annotators are spot-checked, new or struggling annotators are reviewed heavily.'],
  ['Trust tier', 'Trusted, Standard, Probation or At risk, from the probability that an annotator meets the campaign’s quality target given their QA verdicts so far.'],
  ['Quality-aware routing', 'An allocation option that sends urgent and high-priority tasks to annotators with the strongest QA record. Routine work stays balanced.'],
  ['First-pass acceptance', 'The share of reviewed work accepted without rework, weighted by how likely each task was to be sampled so heavier review of weak annotators does not distort it.'],
  ['Delivered accuracy', 'Estimated accuracy of completed work: reviewed tasks were corrected, unreviewed tasks carry their annotator’s estimated error rate.'],
  ['Forecast', 'A Monte Carlo estimate of when remaining work finishes (P50 = median, P90 = conservative), with its assumptions listed.'],
  ['Safe retries', 'Every change is sent with an idempotency key, so if a request times out the app can retry without doing the work twice.'],
];

export const HelpDialog: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => (
  <Modal isOpen={isOpen} onClose={onClose} title="Shortcuts and glossary">
    <div className="space-y-6 text-sm">
      <section>
        <h4 className="mb-2 font-semibold text-slate-100">Navigate</h4>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ROUTES.map(route => (
            <li key={route.id} className="flex items-center justify-between rounded-md bg-slate-950/60 px-3 py-2">
              <span className="text-slate-300">{route.label}</span>
              <Kbd>{route.shortcut}</Kbd>
            </li>
          ))}
          <li className="flex items-center justify-between rounded-md bg-slate-950/60 px-3 py-2">
            <span className="text-slate-300">This help</span>
            <Kbd>?</Kbd>
          </li>
        </ul>
      </section>
      <section>
        <h4 className="mb-2 font-semibold text-slate-100">QA review queue</h4>
        <p className="text-slate-400">
          <Kbd>J</Kbd> / <Kbd>K</Kbd> move between tasks, <Kbd>A</Kbd> accepts, <Kbd>R</Kbd> requests rework,{' '}
          <Kbd>B</Kbd> blocks, <Kbd>E</Kbd> escalates, <Kbd>H</Kbd> opens the task history.
        </p>
      </section>
      <section>
        <h4 className="mb-2 font-semibold text-slate-100">Glossary</h4>
        <dl className="space-y-3">
          {GLOSSARY.map(([term, meaning]) => (
            <div key={term}>
              <dt className="font-medium text-slate-200">{term}</dt>
              <dd className="text-slate-400">{meaning}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  </Modal>
);
