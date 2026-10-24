class Node {
  constructor(value, next = null) {
    this.value = value;
    this.next = next;
  }
}
const head = new Node(1, new Node(2));
let cur = head;
while (cur) {
  cur = cur.next;
}
