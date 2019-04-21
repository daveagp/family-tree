# A simple family tree visualizer

## Demo
https://daveagp.github.io/family-tree/index.html

## How to use
* Create `family.txt` for your family
* Put any photos into the `photos` directory
* Change the first few lines of `family.js`

## Format of your family.txt file
This file will contain
* entries for couples, including their list of offspring
* optionally, entries for individuals, including their lifespan and photo

Entries for couples are formatted like this:
```
Name One + Name Two
c: Child A, Child B, Child C
n: Notes line(s), optional
```
If there are no children or no notes, leave those lines out.

Entries for individuals can contain a `l`ifespan, `p`hoto, and `n`otes.
```
Name Of Person
l: 1912-Dec 2100
p: photo_filename.jpg
n: Notes line(s), optional
```
All lines are optional, and if you have no lines, you need not fill out an entry for someone.
Lifespans can be of the forms `start-end`, `start-` or `-end`.

Here's a simple example file with 2 entries (one couple, one person) and 5 people total:
```
Homer Simpson + Marge Bouvier
c: Lisa Simpson, Bart Simpson, Maggie Simpson
n: Married while pregnant with Lisa
Homer Simpson
l: 1951-
p: homer.jpg
n: Nuclear Safety Inspector in Sector 7G
```

## UI
* The bar at top allows switching the level of detail shown
* Click on a person to make them the root of the tree
* Hover over a person to show all notes for them and their partners

## Data Tricks
* You can leave someone's name as `?` if you don't know it. (Should be a parent or child's name in a couple's entry.)
* Put comments in your `family.txt` by starting them with `#`
* Multiple people with the same name can be disambiguated by putting a `#` after their name, followed by a distinct identifier (which will not be rendered). Example:
```
King George#Older + Mary of Teck
c: King George#Younger
```
* http/s URLs in `n:` notes lines automatically are turned into links. They can't contain spaces.

## Data Limitations
* This program can only handle topological trees, not marrying extended family or two marriages between families
* Names shouldn't contain commas
* If person `X` has two spouses, you need to list them as the first person in one couple and the second person in the other. E.g. `Partner1 + X` and `X + Partner2`. This is because the rendering engine uses the order in each couple as literal positional instructions
* This program can't handle someone who has had more than two spouses/partners

## Disclaimer
Use your judgment when posting sensitive family information on the internet, e.g. you may consider using `.htaccess` or some other appropriate security.

## Etc
* Thanks to The [Simpsons Wiki](http://simpsons.wikia.com/wiki/Portal:All_Simpson_Characters) for their rich dataset.
* See https://daveagp.wordpress.com/2018/04/22/family-tree-visualizer/ for an explanation of the general approach.
