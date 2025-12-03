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

  // --- LOGIC SWITCH ---
  // If it is 9:00 AM (Morocco), we send the "Daily Report" (Everything for today).
  // At any other time, we only send "Urgent Alerts" (Next 90 mins).
  const isMorningReport = (currentHour === 9); 

  console.log(`Time: ${moroccoNow.toISOString().slice(0,16).replace('T', ' ')} (Hour: ${currentHour})`);
  console.log(`Mode: ${isMorningReport ? "☀️ Morning Report (All Day)" : "⚡ Hourly Alert (Urgent Only)"}`);
  
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

      // --- SCENARIO A: MORNING REPORT (Everything Today) ---
      if (isMorningReport) {
        if (startDay === todayStr) {
            messages.push(`📅 TODAY DEPARTURE: ${b.carName} at ${timeStart}`);
        }
        if (endDay === todayStr) {
            messages.push(`📅 TODAY RETURN: ${b.carName} at ${timeEnd}`);
        }
      }

      // --- SCENARIO B: URGENT ALERT (Next 90 mins) ---
      // We check this EVERY hour (even at 9am, so you don't miss a 10am car)
      if (minsUntilStart > 0 && minsUntilStart <= 90) {
        messages.push(`🚀 GOING OUT SOON: ${b.carName} at ${timeStart}`);
      }
      if (minsUntilEnd > 0 && minsUntilEnd <= 90) {
        messages.push(`🏁 DUE BACK SOON: ${b.carName} at ${timeEnd}`);
      }
    });

    // ==========================================
    // 2. CHECK TASKS
    // ==========================================
    const servicesSnap = await db.collection('service_memos').where('status', '!=', 'done').get();
    
    servicesSnap.forEach(doc => {
      const s = doc.data();
      if (!s.dueDate) return;

      const dueTime = new Date(s.dueDate);
      const dueDay = s.dueDate.split('T')[0];
      const minsUntilDue = (dueTime - moroccoNow) / 60000;
      const timeStr = s.dueDate.split('T')[1].slice(0,5);

      // Morning Report
      if (isMorningReport && dueDay === todayStr) {
         messages.push(`📅 TODAY TASK: ${s.description} at ${timeStr}`);
      }

      // Urgent Alert
      if (minsUntilDue > 0 && minsUntilDue <= 90) {
         messages.push(`⚠️ TASK DUE SOON: ${s.description} at ${timeStr}`);
      }
    });

    // ==========================================
    // 3. SEND NOTIFICATIONS
    // ==========================================
    // Filter duplicates (In case a car is due at 10am, it might trigger both Morning + Urgent)
    const uniqueMessages = [...new Set(messages)];

    if (uniqueMessages.length > 0) {
      console.log(`Sending ${uniqueMessages.length} alerts.`);
      for (const msg of uniqueMessages) {
        await fetch(`https://ntfy.sh/${NOTIFY_TOPIC}`, {
          method: 'POST',
          body: msg,
          headers: { 'Title': isMorningReport ? 'Black Iris Daily Plan' : 'Black Iris Alert', 'Priority': 'high', 'Tags': 'car' }
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