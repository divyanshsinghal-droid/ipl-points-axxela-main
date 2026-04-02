const IPL_ABBR = {
  'Chennai Super Kings': 'CSK',
  'Mumbai Indians': 'MI',
  'Royal Challengers Bengaluru': 'RCB',
  'Royal Challengers Bangalore': 'RCB',
  'Kolkata Knight Riders': 'KKR',
  'Sunrisers Hyderabad': 'SRH',
  'Delhi Capitals': 'DC',
  'Rajasthan Royals': 'RR',
  'Punjab Kings': 'PBKS',
  'Lucknow Super Giants': 'LSG',
  'Gujarat Titans': 'GT',
};

export function teamAbbr(fullName) {
  if (!fullName) return '';
  return IPL_ABBR[fullName] || fullName.split(' ').map(w => w[0]).join('').slice(0, 4);
}
