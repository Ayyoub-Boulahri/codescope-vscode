def risky(x):
    return 10 // x

try:
    risky(0)
except ZeroDivisionError as e:
    msg = str(e)
print(msg)
