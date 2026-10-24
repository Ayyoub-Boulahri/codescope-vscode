function findMax(arr) {
  let best = arr[0];
  for (let i = 1; i < arr.length + 1; i++) {
    // bug: off by one
    if (arr[i] > best) {
      best = arr[i];
    }
  }
  return best;
}

console.log(findMax([3, 7, 2, 9]));
