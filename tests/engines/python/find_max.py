def find_max(arr):
    best = arr[0]
    for i in range(1, len(arr) + 1):   # bug: off by one
        if arr[i] > best:
            best = arr[i]
    return best

print(find_max([3, 7, 2, 9]))
