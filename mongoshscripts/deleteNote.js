// === Delete a note + cascade cleanup (topics, subjects) ===
// SET THIS:
const NOTE_ID_HEX = '690fd7a934fbc675eca704e9';  // <-- put note's _id hex here
const DRY_RUN = false;                            // true = preview only

function oidOrNull(s) { try { return s ? ObjectId(s) : null; } catch (e) { return null; } }

(function () {
  if (!NOTE_ID_HEX || !/^[a-fA-F0-9]{24}$/.test(NOTE_ID_HEX)) { print('Invalid NOTE_ID_HEX'); return; }
  const noteOid = ObjectId(NOTE_ID_HEX);

  const note = db.notes.findOne({ _id: noteOid });
  if (!note) { print('Note not found: ' + NOTE_ID_HEX); return; }

  const subjectIdStr = (note.subjectId || '').trim();
  const topicIdStr   = (note.topicId   || '').trim();
  const subjectOid   = oidOrNull(subjectIdStr);
  const topicOid     = oidOrNull(topicIdStr);

  print('Note to delete:');
  printjson({ _id: note._id, title: note.title, subjectIdStr, topicIdStr });

  // 1) Delete the note
  if (DRY_RUN) {
    print('[DRY RUN] Would delete note ' + NOTE_ID_HEX);
  } else {
    const r1 = db.notes.deleteOne({ _id: noteOid });
    print('Deleted notes: ' + r1.deletedCount);
  }

  // 2) If topic exists and now has zero notes, delete it
  let topicDeleted = false;
  if (topicIdStr) {
    const remainingForTopic = db.notes.countDocuments({ topicId: topicIdStr });
    print('Remaining notes for topic ' + topicIdStr + ': ' + remainingForTopic);
    if (remainingForTopic === 0 && topicOid) {
      if (DRY_RUN) {
        print('[DRY RUN] Would delete topic ' + topicIdStr);
        topicDeleted = true;
      } else {
        const r2 = db.topics.deleteOne({ _id: topicOid });
        print('Deleted topics: ' + r2.deletedCount);
        topicDeleted = (r2.deletedCount === 1);
      }
    }
  }

  // 3) If we deleted the topic, and subject now has zero topics and zero notes, delete the subject
  if (topicDeleted && subjectIdStr) {
    const remainingTopics = db.topics.countDocuments({ subjectId: subjectIdStr });
    const remainingNotes  = db.notes.countDocuments({ subjectId: subjectIdStr });
    print('Remaining topics for subject ' + subjectIdStr + ': ' + remainingTopics);
    print('Remaining notes for subject ' + subjectIdStr + ': ' + remainingNotes);

    if (remainingTopics === 0 && remainingNotes === 0 && subjectOid) {
      if (DRY_RUN) {
        print('[DRY RUN] Would delete subject ' + subjectIdStr);
      } else {
        const r3 = db.subjects.deleteOne({ _id: subjectOid });
        print('Deleted subjects: ' + r3.deletedCount);
      }
    }
  }

  print('Done.');
})();
