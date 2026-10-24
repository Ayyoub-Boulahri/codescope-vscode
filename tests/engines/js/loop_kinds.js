let n = 0;
do {
  n++;
} while (n < 2);
for (const ch of 'ab') {
  n += ch.length;
}
for (const key in { a: 1 }) {
  n += key.length;
}
outer: for (let i = 0; i < 3; i++) {
  for (let j = 0; j < 3; j++) {
    if (j === 1) continue outer;
    if (i === 2) break outer;
  }
}
switch (n) {
  case 5:
    n = 0;
    break;
  default:
    n = -1;
}
const double = (x) => x * 2;
console.log(double(n));
