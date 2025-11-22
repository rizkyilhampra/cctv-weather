/**
 * Time and greeting utilities for Indonesian locale
 */

export interface TimeGreeting {
  greeting: string;
  dayName: string;
  hour: number;
}

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/**
 * Get WITA (Asia/Makassar) time greeting and day name
 */
export function getWITAGreeting(): TimeGreeting {
  const now = new Date();
  const witaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Makassar' }));
  const hour = witaTime.getHours();

  let greeting: string;
  if (hour >= 5 && hour < 11) {
    greeting = 'Selamat pagi';
  } else if (hour >= 11 && hour < 15) {
    greeting = 'Selamat siang';
  } else if (hour >= 15 && hour < 19) {
    greeting = 'Selamat sore';
  } else {
    greeting = 'Selamat malam';
  }

  const dayName = DAY_NAMES[witaTime.getDay()];

  return { greeting, dayName, hour };
}
