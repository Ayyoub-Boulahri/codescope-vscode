total = 0
for i in range(3):
    for j in range(2):
        total += i * j
n = 2
while n > 0:
    n -= 1
print(total, n)
