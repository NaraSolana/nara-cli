# Quest Question Types & Solving Strategies

Questions are math, string, or logic puzzles. Answers must be exact.

## Arithmetic

- **Digit sum**: "What is the sum of the digits of 66201?" -> 6+6+2+0+1 = `15`
- **Digital root**: "What is the digital root of 2145?" -> 2+1+4+5=12, 1+2 = `3`

## Bitwise Operations

- **Bitwise NOT**: "What is the bitwise NOT of 54 as a 8-bit unsigned integer?" -> ~54 = 255-54 = `201`
- **Bitwise AND**: "What is 9 AND 39?" -> 9 & 39 = `1`
- **Bitwise OR/XOR**: Same pattern, apply the operation in decimal

## String Manipulation

- **Remove every Nth character**: "Remove every 2nd character from 'enchilada'" -> keep 1st,3rd,5th,7th,9th = `eciaa`
- **Swap halves**: "Take 'optimization', swap its first half and second half" -> split at midpoint, swap = `zationoptimi`
- **Sort characters**: "Sort the characters alphabetically" -> sort then join
- **Uppercase/lowercase**: Apply after other transformations
- **Keep characters at prime positions**: Positions are 1-indexed. Primes: 2,3,5,7,11... -> keep those chars
- **Common letters**: Find intersection of character sets, sort result

## Pig Latin

- Starts with consonant(s): move leading consonants to end + "ay" -> "peak" = `eakpay`
- Starts with vowel: add "yay" -> "apple" = `appleyay`

## Prime Numbers

- "Is N a prime number? Answer yes or no." -> test primality, answer `yes` or `no`

## Multi-step

Questions may chain operations: "Start with X. Step 1: do A. Step 2: do B." -> apply steps in order.

## General Tips

- String answers are case-sensitive
- Numeric answers are plain integers (no leading zeros unless the answer is "0")
- When in doubt about position indexing, 1-indexed is most common in these questions
- Compute fast, submit immediately - speed wins rewards
