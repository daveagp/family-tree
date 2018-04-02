# A simple family tree visualizer

## Demo
https://daveagp.github.io/family-tree/index.html

## How to use
* Change the first few lines of family.js
* Fill out your family.txt
* Put any photos into the `photos` directory

## Format of your family.txt file
This file will contain
* entries for couples, including their list of offspring
* optionally, entries for individuals, including their lifespan and photo

Entries for couples are formatted like this:
```Name One + Name Two
c: Child A, Child B, Child C
n: Notes line(s), optional```
If there are no children or no notes, leave those lines out.

Entries for individuals can contain a `l`ifespan, `p`hoto, and `n`otes.
```Name Of Person
l: 1912-Dec 2100
p: photo_filename.jpg
n: Notes line(s), optional```
All lines are optional, and if you have no lines, you need not fill out an entry for someone.
Lifespans can be of the forms `start-end`, `start-` or `-end`.

Here's a simple example file with 2 entries (one couple, one person) and 5 people total:
```Homer Simpson + Marge Bouvier
c: Lisa Simpson, Bart Simpson, Maggie Simpson
Homer Simpson
l: 1951-
p: homer.jpg
n: Nuclear Safety Inspector in Sector 7G```

## Tricks
* You can leave someone's name as `?` if you don't know it. (Should be a parent or child's name in a couple's entry.)
* Lines in your family.txt starting with `#` are comments
* Multiple people with the same name can be disambiguated by putting a `#` after their name, followed by a distinct identifier (which will not be rendered). Example:
```King George#Older + Mary of Teck
c: King George#Younger```
