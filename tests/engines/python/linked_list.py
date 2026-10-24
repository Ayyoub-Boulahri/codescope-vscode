class Node:
    def __init__(self, value, next=None):
        self.value = value
        self.next = next

head = Node(1, Node(2, Node(3)))
alias = head
data = {"a": [1, 2], "b": (3, 4)}
seen = {3, 1, 2}
cur = head
while cur:
    cur = cur.next
