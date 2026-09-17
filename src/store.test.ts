import assert from 'node:assert/strict';

process.env.TG_TOKEN = 'mock_token';
process.env.TG_GROUP_ID = '-100123456';

const { store } = await import('./store.js');

// Test userIcons functionality
const testUid = 'test_uid_99999';

// Clean up before test
store.deleteUserIcon(testUid);

// 1. Initial get should be undefined
assert.equal(store.getUserIcon(testUid), undefined, 'Initially, user icon should be undefined');

// 2. Set user icon
store.setUserIcon(testUid, '👑');
assert.equal(store.getUserIcon(testUid), '👑', 'User icon should be set to 👑');

// 3. GetAllUserIcons contains the set icon
const all = store.getAllUserIcons();
assert.equal(all[testUid], '👑', 'getAllUserIcons should contain the test UID icon');

// 4. Update user icon with whitespace trimmed
store.setUserIcon(testUid, '  🌟  ');
assert.equal(store.getUserIcon(testUid), '🌟', 'User icon should be updated and trimmed to 🌟');

// 5. Delete user icon
const deleted = store.deleteUserIcon(testUid);
assert.equal(deleted, true, 'deleteUserIcon should return true when icon existed');
assert.equal(store.getUserIcon(testUid), undefined, 'After deletion, user icon should be undefined');

// 6. Delete again should return false
const deletedAgain = store.deleteUserIcon(testUid);
assert.equal(deletedAgain, false, 'deleteUserIcon should return false when icon does not exist');

// 7. Empty string should not set icon
store.setUserIcon(testUid, '   ');
assert.equal(store.getUserIcon(testUid), undefined, 'Setting empty icon should be ignored');

// 8. Stats contains userIcons count
const stats = store.stats();
assert.equal(typeof stats.userIcons, 'number', 'stats.userIcons must be a number');

// Clean up
store.deleteUserIcon(testUid);

// 9. Test store.updateName for DM (type: 0) and Group (type: 1)
const testDmTopicId = 888801;
const testDmZaloId = 'test_dm_user_888';
store.set({ topicId: testDmTopicId, zaloId: testDmZaloId, type: 0, name: 'Old DM Name' });
store.setDmNameOverride(testDmZaloId, 'New DM Name');
assert.equal(store.getDmNameOverride(testDmZaloId), 'New DM Name');
assert.equal(store.getEntryByTopic(testDmTopicId)?.name, 'New DM Name');
store.remove(testDmTopicId);

const testGroupTopicId = 888802;
const testGroupZaloId = 'test_group_888';
store.set({ topicId: testGroupTopicId, zaloId: testGroupZaloId, type: 1, name: 'Old Group Name' });
store.updateName(testGroupTopicId, 'New Group Name');
assert.equal(store.getEntryByTopic(testGroupTopicId)?.name, 'New Group Name');
assert.equal(store.getDmNameOverride(testGroupZaloId), undefined, 'Group rename must not set dmNameOverrides');
store.remove(testGroupTopicId);

console.log('All store tests passed successfully!');
