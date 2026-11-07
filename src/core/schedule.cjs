function due(schedule, now=new Date()) {
  if(schedule.enabled===false||!schedule.days?.includes(now.getDay())||!schedule.times?.includes(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`))return null;
  const key=`${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}/${now.getHours()}:${now.getMinutes()}`;
  return schedule.lastRun===key?null:key;
}
function validate(schedule) {
  if(!Array.isArray(schedule.days)||!schedule.days.length||schedule.days.some(x=>!Number.isInteger(x)||x<0||x>6))throw Error('Select at least one day.');
  if(!Array.isArray(schedule.times)||!schedule.times.length||schedule.times.some(x=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(x)))throw Error('Use times in HH:mm format.');
  if(schedule.times.length>48)throw Error('Maximum 48 times per schedule.');
  return {...schedule,days:[...new Set(schedule.days)],times:[...new Set(schedule.times)].sort()};
}
module.exports={due,validate};
