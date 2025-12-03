const admin = require("firebase-admin");

// 1. Setup Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const NOTIFY_TOPIC = "black-iris-secure-09"; // Must match your phone app

async function checkAndNotify() {
  console.log("Starting Daily Fleet Check...");
  const now = new Date();
  // Adjust for Morocco Time (UTC+1)
  // The server time is UTC. We add 1 hour to get local date string.
  const moroccoTime = new Date(now.getTime() + (60 * 60 * 1000));
  const todayStr = moroccoTime.toISOString().split('T')[0];
  
  console.log(`Checking for date: ${todayStr}`);
  
  let messages = [];

  try {
    // --- 1. CHECK BOOKINGS ---
    // We get all active bookings to check dates
    const bookingsSnap = await db.collection('admin_bookings').where('returned', '==', false).get();
    
    bookingsSnap.forEach(doc => {
      const b = doc.data();
      if (!b.start || !b.end) return;

      const startStr = b.start.split('T')[0];
      const endStr = b.end.split('T')[0];
      const timeStart = b.start.split('T')[1].slice(0, 5); // 14:00
      const timeEnd = b.end.split('T')[1].slice(0, 5);

      if (startStr === todayStr) {
        messages.push(`🚀 OUT TODAY: ${b.carName} at ${timeStart}`);
      }
      if (endStr === todayStr) {
        messages.push(`🏁 RETURN TODAY: ${b.carName} at ${timeEnd}`);
      }
    });

    // --- 2. CHECK TASKS (Due in 48h) ---
    const servicesSnap = await db.collection('service_memos').where('status', '!=', 'done').get();
    const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
    
    servicesSnap.forEach(doc => {
      const s = doc.data();
      if (!s.dueDate) return;

      const due = new Date(s.dueDate);
      const diff = due - moroccoTime;

      // If due within 48 hours and not in the past (allow small buffer)
      if (diff > -86400000 && diff <= twoDaysInMs) {
         // Format date simply
         const day = String(due.getDate()).padStart(2, '0');
         const month = String(due.getMonth() + 1).padStart(2, '0');
         messages.push(`⚠️ TASK DUE: ${s.description} (${day}/${month})`);
      }
    });

    // --- 3. SEND TO PHONE ---
    if (messages.length > 0) {
      console.log(`Found ${messages.length} alerts. Sending to phone...`);
      for (const msg of messages) {
        await fetch(`https://ntfy.sh/${NOTIFY_TOPIC}`, {
          method: 'POST',
          body: msg,
          headers: { 
              'Title': 'Black Iris Update', 
              'Priority': 'high', 
              'Tags': 'car' 
          }
        });
      }
      console.log("Notifications sent.");
    } else {
      console.log("No alerts found for today.");
    }

  } catch (error) {
    console.error("Critical Error:", error);
    process.exit(1);
  }
}

checkAndNotify();
