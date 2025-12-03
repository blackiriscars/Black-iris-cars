const admin = require("firebase-admin");

// 1. Setup Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const NOTIFY_TOPIC = "black-iris-secure-09"; 

async function checkAndNotify() {
  const now = new Date();
  // Server is UTC. Morocco is UTC+1. Add 1 hour.
  const moroccoNow = new Date(now.getTime() + (3600 * 1000));
  const currentHour = moroccoNow.getHours();
  const todayStr = moroccoNow.toISOString().split('T')[0];

  // Morning Report only at 9 AM
  const isMorningReport = (currentHour === 9); 

  console.log(`Time: ${moroccoNow.toISOString().slice(0,16).replace('T', ' ')}`);
  
  let messages = [];

  try {
    // ==========================================
    // 1. CHECK BOOKINGS
    // ==========================================
    const bookingsSnap = await db.collection('admin_bookings').where('returned', '==', false).get();
    
    bookingsSnap.forEach(doc => {
      const b = doc.data();
      if (!b.start || !b.end) return;

      const startTime = new Date(b.start);
      const endTime = new Date(b.end);
      const startDay = b.start.split('T')[0];
      const endDay = b.end.split('T')[0];

      // Calculate minutes until event
      const minsUntilStart = (startTime - moroccoNow) / 60000;
      const minsUntilEnd = (endTime - moroccoNow) / 60000;
      
      const timeStart = b.start.split('T')[1].slice(0,5);
      const timeEnd = b.end.split('T')[1].slice(0,5);

      // MORNING REPORT
      if (isMorningReport) {
        if (startDay === todayStr) messages.push(`📅 TODAY DEPARTURE: ${b.carName} at ${timeStart}`);
        if (endDay === todayStr) messages.push(`📅 TODAY RETURN: ${b.carName} at ${timeEnd}`);
      }

      // --- LOGIC UPDATED FOR CLARITY ---
      
      // DEPARTURE CHECK (Window: -40 to +50)
      if (minsUntilStart > -40 && minsUntilStart <= 50) {
        let prefix;
        if (minsUntilStart < 0) {
            // It is in the past (0 to 40 mins ago)
            prefix = "✅ DEPARTED RECENTLY (Check Active)"; 
        } else if (minsUntilStart <= 15) {
            // It is very close (0 to 15 mins away)
            prefix = "🚨 GOING OUT NOW";
        } else {
            // It is a bit further (15 to 50 mins away)
            prefix = "🚀 GOING OUT SOON";
        }
        messages.push(`${prefix}: ${b.carName} at ${timeStart}`);
      }

      // RETURN CHECK (Window: -40 to +50)
      if (minsUntilEnd > -40 && minsUntilEnd <= 50) {
        let prefix;
        if (minsUntilEnd < 0) {
            // It is in the past (Overdue)
            prefix = "🚨 OVERDUE / RETURN NOW"; 
        } else if (minsUntilEnd <= 15) {
             // Very close
            prefix = "🚨 RETURNING NOW";
        } else {
            prefix = "🏁 DUE BACK SOON";
        }
        messages.push(`${prefix}: ${b.carName} at ${timeEnd}`);
      }
    });

    // ==========================================
    // 2. CHECK TASKS
    // ==========================================
    const servicesSnap = await db.collection('service_memos').where('status', '!=', 'done').get();
    const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
    
    servicesSnap.forEach(doc => {
      const s = doc.data();
      if (!s.dueDate) return;

      const dueTime = new Date(s.dueDate);
      const diff = dueTime - moroccoNow;
      const minsUntilDue = diff / 60000;
      
      const timeStr = s.dueDate.split('T')[1].slice(0,5);
      const dateStr = s.dueDate.split('T')[0];

      // MORNING REPORT
      if (isMorningReport && diff > 0 && diff <= twoDaysInMs) {
         messages.push(`🛠️ MAINTENANCE DUE (${dateStr}): ${s.description}`);
      }

      // URGENT ALERT
      if (minsUntilDue > -40 && minsUntilDue <= 50) {
         let prefix = "⚠️ TASK DUE SOON";
         if (minsUntilDue < 0) prefix = "🚨 TASK OVERDUE";
         else if (minsUntilDue <= 15) prefix = "🚨 TASK DUE NOW";
         
         messages.push(`${prefix}: ${s.description} at ${timeStr}`);
      }
    });

    // ==========================================
    // 3. SEND NOTIFICATIONS
    // ==========================================
    const uniqueMessages = [...new Set(messages)];

    if (uniqueMessages.length > 0) {
      console.log(`Sending ${uniqueMessages.length} alerts.`);
      for (const msg of uniqueMessages) {
        await fetch(`https://ntfy.sh/${NOTIFY_TOPIC}`, {
          method: 'POST',
          body: msg,
          headers: { 'Title': isMorningReport ? 'Black Iris Daily' : 'Black Iris Alert', 'Priority': 'high', 'Tags': 'car' }
        });
      }
    } else {
      console.log("No alerts.");
    }

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkAndNotify();