const admin = require("firebase-admin");

// 1. Setup Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const NOTIFY_TOPIC = "black-iris-secure-09"; 

async function checkAndNotify() {
  console.log("Starting Hourly Check...");
  
  // 1. Get Current Time in Morocco
  const now = new Date();
  // Server is UTC. Morocco is UTC+1. Add 1 hour (3600000 ms).
  const moroccoNow = new Date(now.getTime() + (3600 * 1000));
  
  console.log(`Current Morocco Time: ${moroccoNow.toISOString().slice(0,16).replace('T', ' ')}`);
  
  let messages = [];

  try {
    // --- CHECK BOOKINGS ---
    // We grab all active bookings
    const bookingsSnap = await db.collection('admin_bookings').where('returned', '==', false).get();
    
    bookingsSnap.forEach(doc => {
      const b = doc.data();
      if (!b.start || !b.end) return;

      // Note: "new Date(b.start)" in Node assumes UTC. 
      // Since your input is just a string (e.g. "14:30"), this works perfectly 
      // when compared to our manually adjusted "moroccoNow".
      const startTime = new Date(b.start);
      const endTime = new Date(b.end);

      // Calculate difference in minutes
      const minsUntilStart = (startTime - moroccoNow) / 60000;
      const minsUntilEnd = (endTime - moroccoNow) / 60000;

      // Logic: Notify if the event is between 0 and 90 minutes from now.
      // We use 90 instead of 60 to be safe, so if the robot is slightly slow, we don't miss it.
      
      // CHECK DEPARTURE
      if (minsUntilStart > 0 && minsUntilStart <= 90) {
        const timeStr = b.start.split('T')[1].slice(0,5);
        messages.push(`🚀 GOING OUT SOON: ${b.carName} at ${timeStr}`);
      }

      // CHECK RETURN
      if (minsUntilEnd > 0 && minsUntilEnd <= 90) {
        const timeStr = b.end.split('T')[1].slice(0,5);
        messages.push(`🏁 DUE BACK SOON: ${b.carName} at ${timeStr}`);
      }
    });

    // --- SEND NOTIFICATIONS ---
    if (messages.length > 0) {
      console.log(`Found ${messages.length} upcoming events.`);
      for (const msg of messages) {
        await fetch(`https://ntfy.sh/${NOTIFY_TOPIC}`, {
          method: 'POST',
          body: msg,
          headers: { 'Title': 'Black Iris Alert', 'Priority': 'high', 'Tags': 'car,clock' }
        });
      }
    } else {
      console.log("No events in the next 90 minutes.");
    }

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkAndNotify();