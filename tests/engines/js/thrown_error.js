function check(x) {
  if (x < 0) {
    throw new RangeError('negative: ' + x);
  }
  return x;
}
try {
  check(-1);
} catch (e) {
  console.log('caught', e.message);
}
check(-2);
