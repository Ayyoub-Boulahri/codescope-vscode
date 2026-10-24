const point = { x: 1, y: 2 };
const alias = point;
alias.x = 10;
const list = [1, [2, 3], { z: 4 }];
list.push(5);
const m = new Map([['a', 1]]);
const s = new Set([1, 2]);
console.log(point, list);
