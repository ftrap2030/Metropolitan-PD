import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

async function importFile(path) {
  return import(pathToFileURL(path).href);
}

function fakeDb() {
  const store = new Map();
  return {
    store,
    isAvailable: () => true,
    async get(key, fallback = null) {
      return store.has(key) ? store.get(key) : fallback;
    },
    async set(key, value) {
      store.set(key, structuredClone(value));
      return true;
    },
    async delete(key) {
      store.delete(key);
      return true;
    },
    getStatus() {
      return { connectionType: 'verification-memory' };
    },
  };
}

async function verifyImports() {
  const dirs = [
    'src/commands/LEO',
    'src/services/leo',
    'src/interactions/buttons/leo',
    'src/interactions/modals/leo',
    'src/interactions/selectMenus/leo',
  ];
  const files = [];
  for (const dir of dirs) files.push(...await walk(join(ROOT, dir)));
  files.push(
    join(ROOT, 'src/events/interactionCreate.js'),
    join(ROOT, 'src/events/messageCreate.js'),
    join(ROOT, 'src/events/guildMemberAdd.js'),
    join(ROOT, 'src/events/leoDangerousRoleGrant.js'),
    join(ROOT, 'src/events/leoRaidChannelCreate.js'),
    join(ROOT, 'src/events/leoRaidChannelDelete.js'),
    join(ROOT, 'src/events/leoRaidMessage.js'),
    join(ROOT, 'src/events/leoTicketActivity.js'),
    join(ROOT, 'src/events/leoTicketMaintenance.js'),
    join(ROOT, 'src/commands/Moderation/ban.js'),
    join(ROOT, 'src/commands/Ticket/close.js'),
    join(ROOT, 'src/utils/permissionGuard.js'),
    join(ROOT, 'src/utils/ticket/ticketPermissions.js'),
  );
  for (const file of files) await importFile(file);
  return files.length;
}

async function verifySlashCommands() {
  const files = await walk(join(ROOT, 'src/commands/LEO'));
  const names = new Set();
  for (const file of files) {
    const mod = await importFile(file);
    const command = mod.default;
    assert(command?.data?.toJSON, `${file} must export a SlashCommandBuilder command`);
    assert.equal(typeof command.execute, 'function', `${file} must export execute()`);
    assert.equal(command.leoGuildOnly, true, `${file} must remain guild-only to protect the global command limit`);
    const json = command.data.toJSON();
    assert(!names.has(json.name), `duplicate LEO slash command: ${json.name}`);
    names.add(json.name);
  }

  const required = [
    'admin','setname','setavatar','promote','infract','editinfraction','revokeinfraction',
    'casenote','casenotes','case','adminlist','giverole','removerole','coc','ranklimit',
    'morph','whitelist-server','unwhitelist-server','alertrole','status','note','listnote',
    'ask','closerequest','switchpanel','unclaim','add','remove','rename','embed','embedv2',
    'setserverbio','banner','shift','shiftstats','shiftleaderboard','loa','callsign','callsigns',
    'training','ridealong',
  ];
  for (const name of required) assert(names.has(name), `missing required LEO slash command /${name}`);
  return names.size;
}

async function verifyPrefixRouting() {
  const base = await importFile(join(ROOT, 'src/services/leo/prefixCommands.js'));
  const extended = await importFile(join(ROOT, 'src/services/leo/prefixCommandsExtended.js'));
  const owner = await importFile(join(ROOT, 'src/services/leo/prefixOwnerCommands.js'));

  const requiredDotCommands = [
    'afk','adminrole','rolemanagerrole','joinrole','hrsystem','promotionrole','infractionrole',
    'infractionappealrole','w1role','w2role','s1role','s2role','suspensionrole','termrole',
    'activitywatchrole','bypass','bypasslist','botblacklist','unbotblacklist','dmlog','undmlog',
    'api-key','testwebhook','repeat','nuke','leave','listserver','invite','restart','blacklist',
    'unblacklist','erlcserverinfo','run','raidprotect','ticketcategory','ticketpanel','ticketsupport',
    'ticketinactivity','transcript','welcomemessage','welcomechannel','promotionchannel','infractionchannel',
    'retirementchannel','prefix','role','renamerole','sendcoc','unmorph','detain','release','setstatus',
    'delete','snipe','alert','lookup','robloxgroup','robloxlink','appealchannel','appealping','status',
    'selfunban','update','protect','unprotect','protects','farestime','fedetime',
    'onduty','offduty','callsign',
  ];
  for (const name of requiredDotCommands) {
    const routed = base.isLeoPrefixCommand(name) || extended.isLeoExtendedPrefixCommand(name);
    assert(routed, `dot command .${name} is not routed`);
  }

  const ownerOnly = [
    'adminrole','rolemanagerrole','joinrole','hrsystem','promotionrole','infractionrole',
    'infractionappealrole','w1role','w2role','s1role','s2role','suspensionrole','termrole',
    'activitywatchrole','bypass','bypasslist','botblacklist','unbotblacklist','dmlog','undmlog',
    'api-key','testwebhook','repeat','nuke','leave','listserver','invite','restart','blacklist','unblacklist',
  ];
  for (const name of ownerOnly) {
    assert(owner.isLeoOwnerPrefixCommand(name), `.${name} must route through the owner-only handler`);
  }
  return requiredDotCommands.length;
}

async function verifyPersistence() {
  const db = fakeDb();
  const client = { db };
  const leoState = await importFile(join(ROOT, 'src/services/leo/leoState.js'));
  const hr = await importFile(join(ROOT, 'src/services/leo/hrService.js'));
  const appeals = await importFile(join(ROOT, 'src/services/leo/moderationAppealService.js'));
  const department = await importFile(join(ROOT, 'src/services/leo/departmentManagementService.js'));
  const training = await importFile(join(ROOT, 'src/services/leo/trainingService.js'));

  await leoState.patchLeoGuildConfig(client, 'guild1', {
    adminUsers: ['100'],
    protectedUsers: ['200'],
    nested: { a: 1 },
  });
  await leoState.patchLeoGuildConfig(client, 'guild1', { nested: { b: 2 } });
  const cfg = await leoState.getLeoGuildConfig(client, 'guild1');
  assert.deepEqual(cfg.adminUsers, ['100']);
  assert(leoState.isProtectedUser(cfg, '200'));
  assert.deepEqual(cfg.nested, { a: 1, b: 2 });

  await leoState.setLeoBypass(client, '300', true, { setBy: '1' });
  assert.equal(await leoState.isLeoBypassed(client, '300'), true);
  await leoState.setBotBlacklist(client, '400', true, { reason: 'test' });
  assert.equal(await leoState.isBotBlacklisted(client, '400'), true);
  await leoState.setServerWhitelisted(client, 'guild1', true, { setBy: '1' });
  assert.equal(await leoState.isServerAuthorized(client, 'guild1'), true);
  assert.equal(await leoState.isServerAuthorized(client, 'guild2'), false);

  const created = await hr.createHrCase(client, 'guild1', {
    kind: 'infraction', targetId: '200', staffId: '100', type: 'W1', reason: 'Verification',
  });
  assert.equal(created.id, '0001');
  const edited = await hr.updateHrCase(client, 'guild1', created.id, { reason: 'Updated' });
  assert.equal(edited.reason, 'Updated');
  const noted = await hr.addHrCaseNote(client, 'guild1', created.id, { text: 'note', authorId: '100' });
  assert.equal(noted.notes.length, 1);

  const appeal = await appeals.createModerationAppeal(client, 'guild1', {
    kind: 'ban', targetId: '200', staffId: '100', reason: 'Verification',
  });
  assert.equal(appeal.id, '0001');
  const updatedAppeal = await appeals.updateModerationAppeal(client, 'guild1', appeal.id, { status: 'approved' });
  assert.equal(updatedAppeal.status, 'approved');

  const started = await department.startShift(client, 'guild1', '500');
  assert.equal(started.ok, true);
  assert.equal((await department.getShiftSummary(client, 'guild1', '500')).active, true);
  const stopped = await department.endShift(client, 'guild1', '500');
  assert.equal(stopped.ok, true);
  assert.equal((await department.getShiftSummary(client, 'guild1', '500')).shiftsCompleted, 1);

  const loa = await department.createLoaRequest(client, 'guild1', '500', 'Verification leave', '2099-12-31');
  assert.equal(loa.ok, true);
  const reviewedLoa = await department.reviewLoa(client, 'guild1', loa.record.id, '100', 'approved', 'Approved in verification');
  assert.equal(reviewedLoa.record.status, 'approved');
  const endedLoa = await department.endLoa(client, 'guild1', '500', loa.record.id);
  assert.equal(endedLoa.record.status, 'ended');

  assert.equal((await department.setCallsign(client, 'guild1', '500', '1A-12')).ok, true);
  const callsigns = await department.getCallsigns(client, 'guild1');
  assert.equal(callsigns['500'], '1A-12');
  const duplicate = await department.setCallsign(client, 'guild1', '501', '1a-12');
  assert.equal(duplicate.reason, 'duplicate');

  const passedTraining = await training.addTrainingResult(client, 'guild1', {
    traineeId: '500', trainerId: '100', program: 'Moderator Basics', result: 'passed', notes: 'Good work',
  });
  assert.equal(passedTraining.result, 'passed');
  assert.equal((await training.getTrainingHistory(client, 'guild1', '500')).length, 1);

  const ridealong = await training.startRidealong(client, 'guild1', '500', '100', 'Verification ride along');
  assert.equal(ridealong.ok, true);
  assert.equal((await training.getActiveRidealongForUser(client, 'guild1', '500')).result, 'in_progress');
  const completedRidealong = await training.completeRidealong(client, 'guild1', '500', '100', 'passed', 'Passed verification');
  assert.equal(completedRidealong.ok, true);
  assert.equal(completedRidealong.record.result, 'passed');
  assert.equal((await training.getTrainingHistory(client, 'guild1', '500')).length, 2);
}

async function verifyGlobalCommandLimit() {
  const commandFiles = await walk(join(ROOT, 'src/commands'));
  const names = new Set();
  for (const file of commandFiles) {
    if (file.includes('/modules/')) continue;
    const mod = await importFile(file);
    const command = mod.default || mod;
    if (!command?.data?.toJSON) continue;
    if (command.leoGuildOnly === true || command.guildOnly === true) continue;
    names.add(command.data.toJSON().name);
  }
  assert(names.size <= 100, `global command count ${names.size} exceeds Discord's 100-command limit`);
  return names.size;
}

const imported = await verifyImports();
const slashCount = await verifySlashCommands();
const dotCount = await verifyPrefixRouting();
await verifyPersistence();
const globalCount = await verifyGlobalCommandLimit();

console.log(`LEO verification passed: ${imported} critical modules imported, ${slashCount} guild-only LEO slash commands, ${dotCount} dot commands routed, ${globalCount} global commands.`);
