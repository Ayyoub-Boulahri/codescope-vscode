function makeCounter() {
  let count = 0;
  return () => ++count;
}
const next = makeCounter();
next();
const last = next();
console.log(last);
