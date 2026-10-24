function pick(k) {
  switch (k) {
    case 1:
      let label = 'one';
      return label;
    default:
      return 'other';
  }
}
console.log(pick(2));
