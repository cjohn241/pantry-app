// campaign.js — the fitness campaign's rules and data: regions, quests,
// XP, levels, gold, the weekly plan, travel weeks and the 5K boss track.
// The Quests screen (quests.js) and the Today card use these functions.
//
// Tables (see db.js):
//   quests    key: id   the quest list, one row per quest you can log
//   questLog  key: id   one row each time you tap Done
// Plus one setting, 'campaign': hero, reward, race date, travel weeks...

import * as db from './db.js';
import { uid, dateKey, addDays, keyToDate } from './ui.js';
import { rules } from './rules.js';

/* ---------- The map ----------
   home: true    folded away during a travel week
   travel: true  moved to the top during a travel week               */

export const REGIONS = [
  { id: 'keep', name: 'The Keep', blurb: 'Home gym strength. Shoulders, arms, glutes, legs.', home: true, icon: 'castle' },
  { id: 'trails', name: 'The Wildlands', blurb: 'Solo run/walks and hikes, anywhere you roam.', home: true, icon: 'trail' },
  { id: 'guild', name: 'The Guild', blurb: 'Pilates. The in-person class is a hard-won quest.', home: true, icon: 'feather' },
  { id: 'coop', name: 'Co-op Quests', blurb: 'Hikes and rollerblading, together.', home: true, icon: 'wheels' },
  { id: 'outpost', name: 'The Outpost', blurb: 'Travel workouts. The brave part counts.', travel: true, icon: 'tent' },
  { id: 'healer', name: "The Healer's Hall", blurb: 'Hinge Health sessions. Works anywhere.', travel: true, icon: 'leaf' },
];

export const regionById = (id) => REGIONS.find((r) => r.id === id);

/** Starting quests. You can change names and XP in Settings. */
function defaultQuests(partner) {
  const q = (id, region, name, xp, extra = {}) => ({ id, region, name, xp, ...extra });
  return [
    q('keep-upper', 'keep', 'Upper body and shoulders', 50),
    q('keep-lower', 'keep', 'Lower body and glutes', 50),
    q('keep-full', 'keep', 'Full-body strength', 50),
    q('trail-runwalk', 'trails', 'Run/walk', 30),
    q('trail-hike', 'trails', 'Solo hike', 35),
    q('healer-hinge', 'healer', 'Hinge Health session', 20),
    q('guild-class', 'guild', 'Pilates class (in person)', 60),
    q('guild-home', 'guild', 'Pilates video at home', 25),
    q('coop-hike', 'coop', partner ? `Hike with ${partner}` : 'Hike together', 35),
    q('coop-blades', 'coop', partner ? `Rollerblading with ${partner}` : 'Rollerblading together', 30),
    // Hotel gym quests ask which gym, so a first visit earns the bonus.
    q('outpost-scout', 'outpost', 'Scout the hotel gym (walk in, look around)', 15, { gym: true }),
    q('outpost-treadmill', 'outpost', 'Hotel gym: treadmill', 30, { gym: true }),
    q('outpost-dumbbell', 'outpost', 'Hotel gym: dumbbell workout', 50, { gym: true }),
    q('outpost-room', 'outpost', 'Room workout (bands and bodyweight)', 30),
  ].map((quest, i) => ({ ...quest, order: i }));
}

export const NEW_GYM_BONUS = 25;
export const RUN_XP = 30;            // each 5K run/walk session
export const STAGE_BONUS = 25;       // finishing all 3 runs of a stage
export const BOSS_XP = 250;          // race day
export const RUNS_PER_STAGE = 3;

/* ---------- The 5K track (Couch to 5K pattern) ----------
   Every run starts and ends with a 5-minute brisk walk.               */

export const C25K = [
  { stage: 1, runs: ['Jog 60 sec, walk 90 sec. Repeat 8 times.'] },
  { stage: 2, runs: ['Jog 90 sec, walk 2 min. Repeat 6 times.'] },
  { stage: 3, runs: ['Jog 90 sec, walk 90 sec, jog 3 min, walk 3 min. Repeat twice.'] },
  { stage: 4, runs: ['Jog 3 min, walk 90 sec, jog 5 min, walk 2½ min, jog 3 min, walk 90 sec, jog 5 min.'] },
  { stage: 5, runs: ['Jog 5 min, walk 3 min. Repeat 3 times.', 'Jog 8 min, walk 5 min, jog 8 min.', 'Jog 20 minutes, no walking.'] },
  { stage: 6, runs: ['Jog 5 min, walk 3 min, jog 8 min, walk 3 min, jog 5 min.', 'Jog 10 min, walk 3 min, jog 10 min.', 'Jog 25 minutes.'] },
  { stage: 7, runs: ['Jog 25 minutes.'] },
  { stage: 8, runs: ['Jog 28 minutes.'] },
  { stage: 9, runs: ['Jog 30 minutes.'] },
];
export const TOTAL_RUNS = C25K.length * RUNS_PER_STAGE; // 27

/** Where you are on the track: { stage, run, text, done } */
export function trackPosition(progress) {
  if (progress >= TOTAL_RUNS) return { stage: C25K.length + 1, run: 0, text: '', done: true };
  const stageIndex = Math.floor(progress / RUNS_PER_STAGE);
  const runIndex = progress % RUNS_PER_STAGE;
  const runs = C25K[stageIndex].runs;
  return {
    stage: stageIndex + 1,
    run: runIndex + 1,
    text: runs[Math.min(runIndex, runs.length - 1)],
    done: false,
  };
}

/* ---------- Levels and gold ----------
   Level 2 at 100 XP, 3 at 300, 4 at 600, 5 at 1,000 ... (each level
   needs 100 more XP than the last). 1 XP earns 1 gold.               */

const xpForLevel = (level) => 50 * (level - 1) * level;

export function levelInfo(xp) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level += 1;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, intoLevel: xp - floor, levelSize: next - floor, toNext: next - xp };
}

/* ---------- Weeks ---------- */

/** The Monday that starts the week containing `date`. */
export function weekStart(date = dateKey()) {
  const day = keyToDate(date).getDay(); // 0 = Sunday
  return addDays(date, day === 0 ? -6 : 1 - day);
}

/* ---------- Settings ---------- */

function defaultCampaign(profile = {}) {
  return {
    hero: { name: profile.name || 'Hero', cls: 'Ranger', skin: 'medium', hair: 'brown', cloak: 'forest' },
    daysPerWeek: 3,
    travelWeeks: [],           // Mondays of weeks marked as travel weeks
    raceDate: null,            // 'YYYY-MM-DD'
    trackProgress: 0,          // 5K runs counted toward the track (0 to 27)
    reward: { name: '', price: 500 },
    goldSpent: 0,
    rewardsClaimed: [],        // [{ name, price, date }]
    gyms: [],                  // hotel gyms you've visited
  };
}

/** Who rollerblades with you: the name in your "not mine" tag, e.g. "Sam's" -> "Sam". */
function partnerName() {
  const tag = rules.notMineFlags.find((f) => /['’]s$/.test(f));
  return tag ? tag.replace(/['’]s$/, '') : '';
}

/**
 * Make sure the campaign exists. Runs at startup and after an import,
 * so older backups (from before the campaign) get the starting quests.
 */
export async function ensureCampaign() {
  if (!(await db.getSetting('campaign'))) {
    const profile = await db.getSetting('profile', {});
    await db.setSetting('campaign', defaultCampaign(profile));
  }
  if (!(await db.getAll('quests')).length) {
    for (const quest of defaultQuests(partnerName())) await db.put('quests', quest);
  }
}

export async function getCampaign() {
  const saved = await db.getSetting('campaign', null);
  return { ...defaultCampaign(), ...(saved || {}) };
}

export function saveCampaign(campaign) {
  return db.setSetting('campaign', campaign);
}

/* ---------- Totals ---------- */

export const entryXp = (e) => (e.xp || 0) + (e.bonusXp || 0);

/** Everything the screens need in one call. */
export async function loadState() {
  const [campaign, quests, log] = await Promise.all([getCampaign(), db.getAll('quests'), db.getAll('questLog')]);
  quests.sort((a, b) => a.order - b.order);
  log.sort((a, b) => (b.at || 0) - (a.at || 0)); // newest first

  const xp = log.reduce((sum, e) => sum + entryXp(e), 0);
  const thisWeek = weekStart();
  const weekLog = log.filter((e) => e.date >= thisWeek && e.date <= addDays(thisWeek, 6));

  return {
    campaign,
    quests,
    log,
    xp,
    gold: xp - campaign.goldSpent,
    level: levelInfo(xp),
    thisWeek,
    weekLog,
    questDays: new Set(weekLog.filter((e) => e.questId !== 'boss').map((e) => e.date)).size,
    travel: campaign.travelWeeks.includes(thisWeek),
    track: trackPosition(campaign.trackProgress),
    bossDefeated: log.some((e) => e.questId === 'boss'),
  };
}

/* ---------- Logging (the Done button) ---------- */

/**
 * Log a quest as done today. Returns the new log entry.
 * options.gym = hotel gym name, options.newGym = true for the first visit.
 */
export async function logQuest(quest, options = {}) {
  const campaign = await getCampaign();
  const entry = {
    id: uid(),
    at: Date.now(),
    date: dateKey(),
    questId: quest.id,
    region: quest.region,
    name: quest.name,
    xp: quest.xp,
    bonusXp: 0,
    note: '',
  };
  if (options.gym) {
    entry.gym = options.gym;
    if (options.newGym && !campaign.gyms.includes(options.gym)) {
      entry.bonusXp = NEW_GYM_BONUS;
      entry.note = 'New gym bonus';
      campaign.gyms.push(options.gym);
      entry.addedGym = true; // so Undo can forget the gym again
      await saveCampaign(campaign);
    }
  }
  await db.put('questLog', entry);
  return entry;
}

/** Log the next 5K run/walk session. */
export async function logRun() {
  const campaign = await getCampaign();
  const pos = trackPosition(campaign.trackProgress);
  if (pos.done) return null;
  const finishesStage = pos.run === RUNS_PER_STAGE;
  const entry = {
    id: uid(),
    at: Date.now(),
    date: dateKey(),
    questId: 'c25k',
    region: 'boss',
    name: `5K stage ${pos.stage}, run ${pos.run}`,
    xp: RUN_XP,
    bonusXp: finishesStage ? STAGE_BONUS : 0,
    note: finishesStage ? `Stage ${pos.stage} complete` : '',
    counted: true, // moved the track forward
  };
  campaign.trackProgress += 1;
  await saveCampaign(campaign);
  await db.put('questLog', entry);
  return entry;
}

/** Race day. */
export async function logBoss() {
  const entry = {
    id: uid(), at: Date.now(), date: dateKey(), questId: 'boss', region: 'boss',
    name: 'Defeated the 5K', xp: BOSS_XP, bonusXp: 0, note: 'Boss defeated',
  };
  await db.put('questLog', entry);
  return entry;
}

/** Take back a logged quest (the Undo button, or the quest log). */
export async function undoEntry(id) {
  const entry = await db.get('questLog', id);
  if (!entry) return;
  const campaign = await getCampaign();
  if (entry.counted) campaign.trackProgress = Math.max(0, campaign.trackProgress - 1);
  if (entry.addedGym) campaign.gyms = campaign.gyms.filter((g) => g !== entry.gym);
  await saveCampaign(campaign);
  await db.remove('questLog', id);
}

/** Start the current 5K stage over (runs already logged keep their XP). */
export async function repeatStage() {
  const campaign = await getCampaign();
  campaign.trackProgress = Math.floor(campaign.trackProgress / RUNS_PER_STAGE) * RUNS_PER_STAGE;
  await saveCampaign(campaign);
}

/** Go back one stage, e.g. after time off. */
export async function stepBackStage() {
  const campaign = await getCampaign();
  const stageStart = Math.floor(campaign.trackProgress / RUNS_PER_STAGE) * RUNS_PER_STAGE;
  campaign.trackProgress = Math.max(0, stageStart - RUNS_PER_STAGE);
  await saveCampaign(campaign);
}

export async function setTravelWeek(on) {
  const campaign = await getCampaign();
  const monday = weekStart();
  campaign.travelWeeks = campaign.travelWeeks.filter((w) => w !== monday);
  if (on) campaign.travelWeeks.push(monday);
  await saveCampaign(campaign);
}

/** Spend gold on the reward you set. */
export async function claimReward() {
  const state = await loadState();
  const { campaign } = state;
  if (!campaign.reward.name || state.gold < campaign.reward.price) return false;
  campaign.goldSpent += campaign.reward.price;
  campaign.rewardsClaimed.push({ ...campaign.reward, date: dateKey() });
  campaign.reward = { name: '', price: campaign.reward.price };
  await saveCampaign(campaign);
  return true;
}

/* ---------- The weekly plan ----------
   Strength days in The Keep come first because they drive shoulders
   and arms. Each slot lists the quests that count for it.            */

const HOME_SLOTS = [
  { label: 'The Keep: upper body and shoulders', quests: ['keep-upper', 'keep-full'] },
  { label: 'The Keep: lower body and glutes', quests: ['keep-lower', 'keep-full'] },
  { label: 'The Guild (Pilates), the Wildlands or a co-op hike', regions: ['guild', 'trails', 'coop'] },
  { label: 'The Keep: full body', quests: ['keep-full', 'keep-upper', 'keep-lower'] },
  { label: 'The Wildlands or Co-op Quests', regions: ['trails', 'coop'] },
  { label: 'Any quest you like', regions: ['keep', 'trails', 'guild', 'coop', 'healer'] },
];

const TRAVEL_SLOTS = [
  { label: 'The Outpost: any hotel gym quest', regions: ['outpost'] },
  { label: "The Healer's Hall: Hinge Health", regions: ['healer'] },
  { label: 'The Outpost: hotel gym or room workout', regions: ['outpost'] },
  { label: "The Healer's Hall", regions: ['healer'] },
  { label: 'The Outpost', regions: ['outpost'] },
  { label: 'Any quest you like', regions: ['outpost', 'healer', 'trails'] },
];

/**
 * This week's plan: [{ label, done, withRun }]. A slot is done when a
 * quest that fits it was logged this week. The 5K run rides along on
 * the first three days.
 */
export function weekPlan(state) {
  const slots = (state.travel ? TRAVEL_SLOTS : HOME_SLOTS).slice(0, state.campaign.daysPerWeek);
  const unused = state.weekLog.filter((e) => e.questId !== 'c25k' && e.questId !== 'boss');
  const runsThisWeek = state.weekLog.filter((e) => e.questId === 'c25k').length;
  return slots.map((slot, i) => {
    const match = unused.findIndex((e) =>
      (slot.quests && slot.quests.includes(e.questId)) || (slot.regions && slot.regions.includes(e.region)));
    const done = match >= 0;
    if (done) unused.splice(match, 1);
    const withRun = !state.track.done && i < RUNS_PER_STAGE;
    // The quest to offer on the Today card for this slot.
    const suggest = slot.quests
      ? state.quests.find((q) => q.id === slot.quests[0])
      : state.quests.find((q) => q.region === slot.regions[0]);
    return { label: slot.label, done, withRun, runDone: withRun && i < runsThisWeek, suggest };
  });
}

/* ---------- Import / export helpers ---------- */

export function normalizeQuest(q, index) {
  return {
    id: q.id || uid(),
    region: regionById(q.region) ? q.region : 'keep',
    name: q.name || 'Quest',
    xp: Number.isFinite(Number(q.xp)) ? Number(q.xp) : 0,
    order: Number.isFinite(Number(q.order)) ? Number(q.order) : index,
    ...(q.gym ? { gym: true } : {}),
  };
}

export function normalizeLogEntry(e) {
  return { ...e, id: e.id || uid(), xp: Number(e.xp) || 0, bonusXp: Number(e.bonusXp) || 0 };
}
