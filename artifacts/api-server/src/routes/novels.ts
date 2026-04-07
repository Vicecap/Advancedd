import { Router, type IRouter } from "express";
import { db, novelsTable } from "@workspace/db";
import { ilike, or, eq, sql } from "drizzle-orm";

const router: IRouter = Router();

const BASE_POPULAR   = "https://raw.githubusercontent.com/Priya997/Novels/master/";
const BASE_CLASSIC   = "https://raw.githubusercontent.com/manjunath5496/classic-ebooks/master/1/";
const BASE_SHIVAM    = "https://raw.githubusercontent.com/shivam1410/books/master/";

const SEED_NOVELS = [
  // ── Dan Brown Thrillers ───────────────────────────────────────────────────────
  { title: "The Da Vinci Code",           author: "Dan Brown",          genre: "Thriller",    fileSizeKb: 1472, featured: true,  rawUrl: BASE_POPULAR + "Dan%20Brown%20-%20The%20Da%20Vinci%20Code.pdf" },
  { title: "Angels & Demons",             author: "Dan Brown",          genre: "Thriller",    fileSizeKb: 1000, featured: true,  rawUrl: BASE_POPULAR + "Dan%20Brown%20-%20Angels%20_%20Demons.pdf" },
  { title: "Inferno",                     author: "Dan Brown",          genre: "Thriller",    fileSizeKb: 2684, featured: false, rawUrl: BASE_POPULAR + "Inferno_A_Novel_Dan_Brown.pdf" },
  { title: "Digital Fortress",            author: "Dan Brown",          genre: "Thriller",    fileSizeKb: 642,  featured: false, rawUrl: BASE_POPULAR + "Brown%2C%20Dan%20-%20Digital%20Fortress.pdf" },
  { title: "Deception Point",             author: "Dan Brown",          genre: "Thriller",    fileSizeKb: 1153, featured: false, rawUrl: BASE_POPULAR + "Dan%20Brown%20-%20Deception%20Point.pdf" },
  { title: "The Lost Symbol",             author: "Dan Brown",          genre: "Thriller",    fileSizeKb: 2742, featured: true,  rawUrl: BASE_SHIVAM + "Fiction/Dan%20Brown/The-Lost-Symbol.pdf" },

  // ── Other Thrillers ───────────────────────────────────────────────────────────
  { title: "The Girl on the Train",       author: "Paula Hawkins",      genre: "Thriller",    fileSizeKb: 2031, featured: true,  rawUrl: BASE_POPULAR + "Paula_Hawkins_-_The_Girl_on_the_Train.pdf" },
  { title: "Gone Girl",                   author: "Gillian Flynn",      genre: "Thriller",    fileSizeKb: 1477, featured: true,  rawUrl: BASE_POPULAR + "Gone_Girl.pdf" },

  // ── Romance ───────────────────────────────────────────────────────────────────
  { title: "The Fault in Our Stars",      author: "John Green",         genre: "Romance",     fileSizeKb: 2091, featured: true,  rawUrl: BASE_POPULAR + "the%20fault%20in%20our%20stars.pdf" },
  { title: "Me Before You",               author: "Jojo Moyes",         genre: "Romance",     fileSizeKb: 1394, featured: true,  rawUrl: BASE_POPULAR + "me-before-you-jojo-moyes.pdf" },
  { title: "The Last Song",               author: "Nicholas Sparks",    genre: "Romance",     fileSizeKb: 1342, featured: false, rawUrl: BASE_POPULAR + "The%20Last%20Song%20-%20Nicholas%20Sparks.pdf" },
  { title: "The Lucky One",               author: "Nicholas Sparks",    genre: "Romance",     fileSizeKb: 375,  featured: false, rawUrl: BASE_POPULAR + "Nicholas_Sparks_-_The_Lucky_One.pdf" },
  { title: "Can Love Happen Twice?",      author: "Ravinder Singh",     genre: "Romance",     fileSizeKb: 29573,featured: false, rawUrl: BASE_POPULAR + "Can_Love_Happen_Twice_Ebook_By.pdf" },
  { title: "By the River Piedra I Sat Down and Wept", author: "Paulo Coelho", genre: "Romance", fileSizeKb: 179, featured: false, rawUrl: BASE_SHIVAM + "Fiction/Paulo%20Coelho/Paulo%20Coelho%20-%20By%20the%20River%20Piedra%20I%20Sat%20Down%20and%20Wept.pdf" },

  // ── Harry Potter ──────────────────────────────────────────────────────────────
  { title: "Harry Potter and the Sorcerer's Stone",       author: "J.K. Rowling", genre: "Fantasy", fileSizeKb: 3278, featured: true,  rawUrl: BASE_SHIVAM + "Fiction/Harry%20Potter/HP1%20-%20Harry%20Potter%20and%20the%20Sorcerer's%20Stone.pdf" },
  { title: "Harry Potter and the Chamber of Secrets",     author: "J.K. Rowling", genre: "Fantasy", fileSizeKb: 3394, featured: true,  rawUrl: BASE_SHIVAM + "Fiction/Harry%20Potter/HP2%20-%20Harry%20Potter%20and%20the%20Chamber%20of%20Secrets.pdf" },
  { title: "Harry Potter and the Prisoner of Azkaban",    author: "J.K. Rowling", genre: "Fantasy", fileSizeKb: 4374, featured: true,  rawUrl: BASE_SHIVAM + "Fiction/Harry%20Potter/HP3%20-%20Harry%20Potter%20and%20the%20Prisoner%20of%20Azkaban.pdf" },
  { title: "Harry Potter and the Goblet of Fire",         author: "J.K. Rowling", genre: "Fantasy", fileSizeKb: 5993, featured: true,  rawUrl: BASE_SHIVAM + "Fiction/Harry%20Potter/HP4%20-%20Harry%20Potter%20and%20the%20Goblet%20of%20Fire.pdf" },
  { title: "Harry Potter and the Order of the Phoenix",   author: "J.K. Rowling", genre: "Fantasy", fileSizeKb: 7441, featured: true,  rawUrl: BASE_SHIVAM + "Fiction/Harry%20Potter/HP5%20-%20Harry%20Potter%20and%20the%20Order%20of%20the%20Phoenix.pdf" },
  { title: "Harry Potter and the Half-Blood Prince",      author: "J.K. Rowling", genre: "Fantasy", fileSizeKb: 5391, featured: false, rawUrl: BASE_SHIVAM + "Fiction/Harry%20Potter/HP6%20-%20Harry%20Potter%20and%20the%20Half-Blood%20Prince.pdf" },
  { title: "Harry Potter and the Deathly Hallows",        author: "J.K. Rowling", genre: "Fantasy", fileSizeKb: 6157, featured: false, rawUrl: BASE_SHIVAM + "Fiction/Harry%20Potter/HP7%20-%20Harry%20Potter%20and%20the%20Deathly%20Hallows.pdf" },

  // ── Fantasy ───────────────────────────────────────────────────────────────────
  { title: "The Chronicles of Narnia",    author: "C.S. Lewis",         genre: "Fantasy",     fileSizeKb: 3769, featured: true,  rawUrl: BASE_POPULAR + "Chronicles%20Of%20Narnia-All%207%20Books.pdf" },
  { title: "The Wonderful Wizard of Oz",  author: "L. Frank Baum",      genre: "Fantasy",     fileSizeKb: 486,  featured: false, rawUrl: BASE_CLASSIC + "Wonderful%20Wizard%20Of%20Oz.pdf" },
  { title: "American Fairy Tales",        author: "L. Frank Baum",      genre: "Fantasy",     fileSizeKb: 421,  featured: false, rawUrl: BASE_CLASSIC + "American%20Fairy%20Tales.pdf" },
  { title: "At the Earth's Core",         author: "Edgar Rice Burroughs",genre: "Fantasy",    fileSizeKb: 576,  featured: false, rawUrl: BASE_CLASSIC + "At%20The%20Earth's%20Core.pdf" },
  { title: "Dorothy and the Wizard in Oz",author: "L. Frank Baum",      genre: "Fantasy",     fileSizeKb: 538,  featured: false, rawUrl: BASE_CLASSIC + "Dorothy%20And%20The%20Wizard%20In%20Oz.pdf" },

  // ── Fiction (Modern) ─────────────────────────────────────────────────────────
  { title: "The God of Small Things",     author: "Arundhati Roy",      genre: "Fiction",     fileSizeKb: 648,  featured: true,  rawUrl: BASE_POPULAR + "Arundhati%20Roy%20-%20The%20God%20of%20Small%20Things.pdf" },
  { title: "The Five People You Meet in Heaven", author: "Mitch Albom", genre: "Fiction",    fileSizeKb: 400,  featured: false, rawUrl: BASE_POPULAR + "Th_FivePeopleYouMeetInHeaven.pdf" },
  { title: "The Kite Runner",             author: "Khaled Hosseini",    genre: "Fiction",     fileSizeKb: 1449, featured: true,  rawUrl: BASE_SHIVAM + "Fiction/The%20Kite%20Runner%20Khaled%20Hosseini.pdf" },
  { title: "The Road Less Traveled",      author: "M. Scott Peck",      genre: "Fiction",     fileSizeKb: 1296, featured: false, rawUrl: BASE_SHIVAM + "Fiction/The%20Road%20Less%20Traveled.pdf" },
  { title: "Eleven Minutes",              author: "Paulo Coelho",       genre: "Fiction",     fileSizeKb: 917,  featured: false, rawUrl: BASE_SHIVAM + "Fiction/Paulo%20Coelho/Paulo%20Coelho%20-%20Eleven%20Minutes.pdf" },
  { title: "The Zahir",                   author: "Paulo Coelho",       genre: "Fiction",     fileSizeKb: 592,  featured: false, rawUrl: BASE_SHIVAM + "Fiction/Paulo%20Coelho/Paulo%20Coelho%20-%20The%20Zahir.pdf" },
  { title: "Veronika Decides to Die",     author: "Paulo Coelho",       genre: "Fiction",     fileSizeKb: 27,   featured: false, rawUrl: BASE_SHIVAM + "Fiction/Paulo%20Coelho/Paulo%20Coelho%20-%20Veronika%20decides%20to%20die.pdf" },
  { title: "Gone with the Wind",          author: "Margaret Mitchell",  genre: "Fiction",     fileSizeKb: 2326, featured: false, rawUrl: BASE_POPULAR + "GONE%20WITH%20THE%20WIND.pdf" },

  // ── Khalil Gibran ─────────────────────────────────────────────────────────────
  { title: "The Prophet",                 author: "Khalil Gibran",      genre: "Philosophy",  fileSizeKb: 187,  featured: true,  rawUrl: BASE_SHIVAM + "Fiction/Khalil%20Gibran/The%20Prophet.pdf" },
  { title: "Sand and Foam",               author: "Khalil Gibran",      genre: "Philosophy",  fileSizeKb: 70,   featured: false, rawUrl: BASE_SHIVAM + "Fiction/Khalil%20Gibran/Sand%20and%20Foam.pdf" },
  { title: "The Madman",                  author: "Khalil Gibran",      genre: "Philosophy",  fileSizeKb: 108,  featured: false, rawUrl: BASE_SHIVAM + "Fiction/Khalil%20Gibran/The%20Madman.pdf" },
  { title: "The Wanderer",                author: "Khalil Gibran",      genre: "Philosophy",  fileSizeKb: 179,  featured: false, rawUrl: BASE_SHIVAM + "Fiction/Khalil%20Gibran/The%20Wanderer.pdf" },
  { title: "A Tear and A Smile",          author: "Khalil Gibran",      genre: "Philosophy",  fileSizeKb: 227,  featured: false, rawUrl: BASE_SHIVAM + "Fiction/Khalil%20Gibran/A%20Tear%20and%20A%20Smile.pdf" },
  { title: "Broken Wings",                author: "Khalil Gibran",      genre: "Romance",     fileSizeKb: 225,  featured: false, rawUrl: BASE_SHIVAM + "Fiction/Khalil%20Gibran/Broken%20Wings.pdf" },

  // ── Philosophy ────────────────────────────────────────────────────────────────
  { title: "The Alchemist",               author: "Paulo Coelho",       genre: "Philosophy",  fileSizeKb: 414,  featured: true,  rawUrl: BASE_POPULAR + "Paulo_Coelho_-_The_Alchemist(1).pdf" },
  { title: "The World as I See It",       author: "Albert Einstein",    genre: "Philosophy",  fileSizeKb: 396,  featured: false, rawUrl: BASE_POPULAR + "Albert%20Einstein%20-%20The%20World%20as%20I%20See%20it.pdf" },
  { title: "Philosophy 101",              author: "Paul Kleinman",      genre: "Philosophy",  fileSizeKb: 8014, featured: true,  rawUrl: BASE_SHIVAM + "philosophy/Philosophy%20101_%20From%20Plato%20and%20Socrates%20to%20Ethics%20and%20Metaphysics%2C%20an%20Essential%20Primer%20on%20the%20History%20of%20Thought%20(%20PDFDrive%20).pdf" },
  { title: "Utopia for Realists",         author: "Rutger Bregman",     genre: "Philosophy",  fileSizeKb: 2317, featured: true,  rawUrl: BASE_SHIVAM + "philosophy/utopia-for-realists-by-rutger-bregman.pdf" },
  { title: "Gitanjali",                   author: "Rabindranath Tagore",genre: "Philosophy",  fileSizeKb: 63,   featured: false, rawUrl: BASE_SHIVAM + "philosophy/R.%20Tagore/Gitanjali.pdf" },
  { title: "Sadhana",                     author: "Rabindranath Tagore",genre: "Philosophy",  fileSizeKb: 134,  featured: false, rawUrl: BASE_SHIVAM + "philosophy/R.%20Tagore/Sadhana%20By%20Rabindranath%20Tagore.pdf" },
  { title: "The Home and the World",      author: "Rabindranath Tagore",genre: "Philosophy",  fileSizeKb: 308,  featured: false, rawUrl: BASE_SHIVAM + "philosophy/R.%20Tagore/The%20Home%20And%20The%20World%20By%20Rabindranath%20Tagore.pdf" },
  { title: "Karma Yoga",                  author: "Swami Vivekananda",  genre: "Philosophy",  fileSizeKb: 352,  featured: false, rawUrl: BASE_SHIVAM + "philosophy/Swami%20vivekananda/karma-yoga.pdf" },
  { title: "Complete Works of Swami Vivekananda",  author: "Swami Vivekananda", genre: "Philosophy", fileSizeKb: 4070, featured: false, rawUrl: BASE_SHIVAM + "philosophy/Swami%20vivekananda/complete%20works%20of%20swami%20viveka%20nanda%20%20vol%201-4.pdf" },
  { title: "Why I Am Not a Christian",    author: "Bertrand Russell",   genre: "Philosophy",  fileSizeKb: 69,   featured: false, rawUrl: BASE_SHIVAM + "philosophy/Bertrand%20Russell/Why%20I%20Am%20Not%20A%20Christian.pdf" },
  { title: "In Praise of Idleness",       author: "Bertrand Russell",   genre: "Philosophy",  fileSizeKb: 61,   featured: false, rawUrl: BASE_SHIVAM + "philosophy/Bertrand%20Russell/In%20Praise%20of%20Idleness.pdf" },
  { title: "A Free Man's Worship",        author: "Bertrand Russell",   genre: "Philosophy",  fileSizeKb: 55,   featured: false, rawUrl: BASE_SHIVAM + "philosophy/Bertrand%20Russell/A%20Free%20Man's%20Worship.pdf" },
  { title: "The Problems of Philosophy",  author: "Bertrand Russell",   genre: "Philosophy",  fileSizeKb: 255,  featured: false, rawUrl: BASE_SHIVAM + "philosophy/Bertrand%20Russell/The%20problems%20of%20philosophy.pdf" },
  { title: "Siddhartha",                  author: "Hermann Hesse",      genre: "Philosophy",  fileSizeKb: 423,  featured: true,  rawUrl: BASE_CLASSIC + "Siddhartha.pdf" },

  // ── Self-help ─────────────────────────────────────────────────────────────────
  { title: "The Monk Who Sold His Ferrari",author: "Robin S. Sharma",   genre: "Self-help",   fileSizeKb: 1312, featured: false, rawUrl: BASE_POPULAR + "The%20Monk%20Who%20Sold%20His%20Ferrari%20_Constantine_.pdf" },
  { title: "Who Moved My Cheese",         author: "Spencer Johnson",    genre: "Self-help",   fileSizeKb: 1929, featured: false, rawUrl: BASE_POPULAR + "who%20moved%20my%20cheese.pdf" },
  { title: "You Can Win",                 author: "Shiv Khera",         genre: "Self-help",   fileSizeKb: 914,  featured: false, rawUrl: BASE_POPULAR + "3755215-You-Can-Win-by-Shiv-Khera.pdf" },
  { title: "Body Language",               author: "Allan Pease",        genre: "Self-help",   fileSizeKb: 2847, featured: false, rawUrl: BASE_POPULAR + "Allan%20Pease%20-%20Body%20Language.pdf" },
  { title: "How to Win Friends and Influence People", author: "Dale Carnegie", genre: "Self-help", fileSizeKb: 467, featured: true, rawUrl: BASE_SHIVAM + "Health/How%20to%20Win%20Friends%20and%20Influence%20People%20by-Dale%20Carnegie.pdf" },

  // ── Jane Austen Classics ──────────────────────────────────────────────────────
  { title: "Pride and Prejudice",         author: "Jane Austen",        genre: "Classic",     fileSizeKb: 1378, featured: true,  rawUrl: BASE_POPULAR + "Pride-and-Prejudice.pdf" },
  { title: "Sense and Sensibility",       author: "Jane Austen",        genre: "Classic",     fileSizeKb: 1527, featured: false, rawUrl: BASE_CLASSIC + "sense-and-sensibility.pdf" },
  { title: "Emma",                        author: "Jane Austen",        genre: "Classic",     fileSizeKb: 1469, featured: false, rawUrl: BASE_CLASSIC + "Emma.pdf" },
  { title: "Mansfield Park",              author: "Jane Austen",        genre: "Classic",     fileSizeKb: 1528, featured: false, rawUrl: BASE_CLASSIC + "Mansfield%20Park.pdf" },
  { title: "Northanger Abbey",            author: "Jane Austen",        genre: "Classic",     fileSizeKb: 795,  featured: false, rawUrl: BASE_CLASSIC + "Northanger%20Abbey.pdf" },
  { title: "Persuasion",                  author: "Jane Austen",        genre: "Classic",     fileSizeKb: 830,  featured: false, rawUrl: BASE_CLASSIC + "Persuasion.pdf" },

  // ── Charles Dickens ───────────────────────────────────────────────────────────
  { title: "A Tale of Two Cities",        author: "Charles Dickens",    genre: "Classic",     fileSizeKb: 1782, featured: true,  rawUrl: BASE_CLASSIC + "A%20Tale%20Of%20Two%20Cities.pdf" },
  { title: "A Christmas Carol",           author: "Charles Dickens",    genre: "Classic",     fileSizeKb: 379,  featured: true,  rawUrl: BASE_CLASSIC + "A%20Christmas%20Carol.pdf" },
  { title: "Great Expectations",          author: "Charles Dickens",    genre: "Classic",     fileSizeKb: 2024, featured: true,  rawUrl: BASE_CLASSIC + "Great%20Expectations.pdf" },
  { title: "David Copperfield",           author: "Charles Dickens",    genre: "Classic",     fileSizeKb: 3924, featured: false, rawUrl: BASE_CLASSIC + "David%20Copperfield.pdf" },
  { title: "Oliver Twist",               author: "Charles Dickens",    genre: "Classic",     fileSizeKb: 1740, featured: false, rawUrl: BASE_CLASSIC + "Oliver%20Twist.pdf" },
  { title: "Bleak House",                 author: "Charles Dickens",    genre: "Classic",     fileSizeKb: 3949, featured: false, rawUrl: BASE_CLASSIC + "Bleak%20House.pdf" },
  { title: "Hard Times",                  author: "Charles Dickens",    genre: "Classic",     fileSizeKb: 1285, featured: false, rawUrl: BASE_CLASSIC + "Hard%20Times.pdf" },

  // ── Other Victorian Classics ─────────────────────────────────────────────────
  { title: "Wuthering Heights",           author: "Emily Brontë",       genre: "Classic",     fileSizeKb: 754,  featured: false, rawUrl: BASE_POPULAR + "Wuthering-Heights.pdf" },
  { title: "Jane Eyre",                   author: "Charlotte Brontë",   genre: "Classic",     fileSizeKb: 2113, featured: true,  rawUrl: BASE_CLASSIC + "Jane%20Eyre.pdf" },
  { title: "Villette",                    author: "Charlotte Brontë",   genre: "Classic",     fileSizeKb: 2366, featured: false, rawUrl: BASE_CLASSIC + "Villette.pdf" },
  { title: "Middlemarch",                 author: "George Eliot",       genre: "Classic",     fileSizeKb: 3530, featured: false, rawUrl: BASE_CLASSIC + "Middlemarch.pdf" },
  { title: "Adam Bede",                   author: "George Eliot",       genre: "Classic",     fileSizeKb: 2430, featured: false, rawUrl: BASE_CLASSIC + "Adam%20Bede.pdf" },
  { title: "Silas Marner",                author: "George Eliot",       genre: "Classic",     fileSizeKb: 866,  featured: false, rawUrl: BASE_CLASSIC + "Silas%20Marner.pdf" },
  { title: "Tess of the d'Urbervilles",   author: "Thomas Hardy",       genre: "Classic",     fileSizeKb: 1516, featured: false, rawUrl: BASE_CLASSIC + "Tess%20Of%20The%20D'Urbervilles.pdf" },
  { title: "Far from the Madding Crowd",  author: "Thomas Hardy",       genre: "Classic",     fileSizeKb: 1443, featured: false, rawUrl: BASE_CLASSIC + "Far%20From%20The%20Madding%20Crowd.pdf" },
  { title: "Jude the Obscure",            author: "Thomas Hardy",       genre: "Classic",     fileSizeKb: 1485, featured: false, rawUrl: BASE_CLASSIC + "Jude%20The%20Obscure.pdf" },
  { title: "A Pair of Blue Eyes",         author: "Thomas Hardy",       genre: "Classic",     fileSizeKb: 1428, featured: false, rawUrl: BASE_CLASSIC + "A%20Pair%20Of%20Blue%20Eyes.pdf" },

  // ── Shakespeare ───────────────────────────────────────────────────────────────
  { title: "Hamlet",                      author: "William Shakespeare", genre: "Classic",    fileSizeKb: 572,  featured: true,  rawUrl: BASE_CLASSIC + "Hamlet.pdf" },
  { title: "Macbeth",                     author: "William Shakespeare", genre: "Classic",    fileSizeKb: 360,  featured: false, rawUrl: BASE_CLASSIC + "Macbeth.pdf" },
  { title: "Romeo and Juliet",            author: "William Shakespeare", genre: "Classic",    fileSizeKb: 427,  featured: true,  rawUrl: BASE_CLASSIC + "Romeo%20And%20Juliet.pdf" },
  { title: "Othello",                     author: "William Shakespeare", genre: "Classic",    fileSizeKb: 465,  featured: false, rawUrl: BASE_CLASSIC + "Othello.pdf" },
  { title: "King Lear",                   author: "William Shakespeare", genre: "Classic",    fileSizeKb: 466,  featured: false, rawUrl: BASE_CLASSIC + "King%20Lear.pdf" },
  { title: "A Midsummer Night's Dream",   author: "William Shakespeare", genre: "Classic",    fileSizeKb: 336,  featured: false, rawUrl: BASE_CLASSIC + "A%20Midsummer%20Night.pdf" },
  { title: "Julius Caesar",               author: "William Shakespeare", genre: "Classic",    fileSizeKb: 377,  featured: false, rawUrl: BASE_CLASSIC + "Julius%20Caesar.pdf" },

  // ── Russian Literature ────────────────────────────────────────────────────────
  { title: "War and Peace",               author: "Leo Tolstoy",        genre: "Classic",     fileSizeKb: 5805, featured: true,  rawUrl: BASE_CLASSIC + "War%20And%20Peace.pdf" },
  { title: "Crime and Punishment",        author: "Fyodor Dostoevsky",  genre: "Classic",     fileSizeKb: 390,  featured: true,  rawUrl: BASE_CLASSIC + "Crime%20And%20Punishment.pdf" },
  { title: "Childhood",                   author: "Leo Tolstoy",        genre: "Classic",     fileSizeKb: 493,  featured: false, rawUrl: BASE_CLASSIC + "Childhood.pdf" },

  // ── French Literature ─────────────────────────────────────────────────────────
  { title: "Les Misérables",              author: "Victor Hugo",        genre: "Classic",     fileSizeKb: 5693, featured: true,  rawUrl: BASE_CLASSIC + "Les%20Miserables.pdf" },
  { title: "Notre-Dame de Paris",         author: "Victor Hugo",        genre: "Classic",     fileSizeKb: 1930, featured: false, rawUrl: BASE_CLASSIC + "Notre%20Dame%20De%20Paris.pdf" },

  // ── American Classics ─────────────────────────────────────────────────────────
  { title: "Adventures of Huckleberry Finn", author: "Mark Twain",     genre: "Classic",     fileSizeKb: 1090, featured: true,  rawUrl: BASE_CLASSIC + "Adventures%20Of%20Huckleberry%20Finn.pdf" },
  { title: "The Adventures of Tom Sawyer",   author: "Mark Twain",     genre: "Classic",     fileSizeKb: 902,  featured: false, rawUrl: BASE_CLASSIC + "The%20Adventures%20of%20Tom%20Sawyer.pdf" },
  { title: "A Connecticut Yankee in King Arthur's Court", author: "Mark Twain", genre: "Classic", fileSizeKb: 1414, featured: false, rawUrl: BASE_CLASSIC + "A%20Connecticut%20Yankee%20in%20King%20Arthur's%20Court.pdf" },
  { title: "A Tramp Abroad",              author: "Mark Twain",         genre: "Classic",     fileSizeKb: 1901, featured: false, rawUrl: BASE_CLASSIC + "A%20Tramp%20Abroad.pdf" },
  { title: "To Kill a Mockingbird",       author: "Harper Lee",         genre: "Classic",     fileSizeKb: 727,  featured: true,  rawUrl: BASE_POPULAR + "Harper%20Lee%20-%20TO%20KILL%20A%20MOCKING%20BIRD.pdf" },
  { title: "Moby-Dick",                   author: "Herman Melville",    genre: "Classic",     fileSizeKb: 2410, featured: false, rawUrl: BASE_CLASSIC + "Moby%20Dick.pdf" },
  { title: "Leaves of Grass",             author: "Walt Whitman",       genre: "Classic",     fileSizeKb: 1297, featured: false, rawUrl: BASE_CLASSIC + "Leaves%20of%20Grass.pdf" },

  // ── British Classics ──────────────────────────────────────────────────────────
  { title: "Alice's Adventures in Wonderland", author: "Lewis Carroll", genre: "Classic",    fileSizeKb: 392,  featured: true,  rawUrl: BASE_CLASSIC + "Alice's%20Adventures%20In%20Wonderland.pdf" },
  { title: "Robinson Crusoe",             author: "Daniel Defoe",       genre: "Classic",     fileSizeKb: 1341, featured: true,  rawUrl: BASE_CLASSIC + "Robinson%20Crusoe.pdf" },
  { title: "Frankenstein",                author: "Mary Shelley",       genre: "Classic",     fileSizeKb: 789,  featured: true,  rawUrl: BASE_CLASSIC + "Frankenstein.pdf" },
  { title: "Dr. Jekyll and Mr. Hyde",     author: "Robert Louis Stevenson", genre: "Classic", fileSizeKb: 342, featured: true, rawUrl: BASE_CLASSIC + "Dr.%20Jekyll%20And%20Mr.%20Hyde.pdf" },
  { title: "Kidnapped",                   author: "Robert Louis Stevenson", genre: "Classic", fileSizeKb: 823, featured: false, rawUrl: BASE_CLASSIC + "Kidnapped.pdf" },
  { title: "A Child's Garden of Verses",  author: "Robert Louis Stevenson", genre: "Classic", fileSizeKb: 225, featured: false, rawUrl: BASE_CLASSIC + "A%20Child's%20Garden%20of%20Verses.pdf" },
  { title: "Little Women",                author: "Louisa May Alcott",   genre: "Classic",    fileSizeKb: 1794, featured: true,  rawUrl: BASE_CLASSIC + "Little%20Women.pdf" },
  { title: "A Little Princess",           author: "Frances Hodgson Burnett", genre: "Classic", fileSizeKb: 747, featured: false, rawUrl: BASE_CLASSIC + "A%20Little%20Princess.pdf" },
  { title: "Black Beauty",                author: "Anna Sewell",        genre: "Classic",     fileSizeKb: 624,  featured: false, rawUrl: BASE_CLASSIC + "Black%20Beauty.pdf" },
  { title: "Peter Pan",                   author: "J.M. Barrie",        genre: "Classic",     fileSizeKb: 559,  featured: true,  rawUrl: BASE_CLASSIC + "Peter%20Pan.pdf" },
  { title: "Anne of Green Gables",        author: "L.M. Montgomery",    genre: "Classic",     fileSizeKb: 1147, featured: true,  rawUrl: BASE_CLASSIC + "Anne%20Of%20Green%20Gables.pdf" },
  { title: "Anne of Avonlea",             author: "L.M. Montgomery",    genre: "Classic",     fileSizeKb: 1021, featured: false, rawUrl: BASE_CLASSIC + "Anne%20Of%20Avonlea.pdf" },

  // ── Irish / Other European ────────────────────────────────────────────────────
  { title: "Ulysses",                     author: "James Joyce",        genre: "Classic",     fileSizeKb: 3034, featured: false, rawUrl: BASE_CLASSIC + "Ulysses.pdf" },
  { title: "A Portrait of the Artist as a Young Man", author: "James Joyce", genre: "Classic", fileSizeKb: 1040, featured: false, rawUrl: BASE_CLASSIC + "A%20Portrait%20Of%20The%20Artist%20As%20A%20Young%20Man.pdf" },
  { title: "Dubliners",                   author: "James Joyce",        genre: "Classic",     fileSizeKb: 728,  featured: false, rawUrl: BASE_CLASSIC + "Dubliners.pdf" },
  { title: "Metamorphosis",               author: "Franz Kafka",        genre: "Classic",     fileSizeKb: 260,  featured: true,  rawUrl: BASE_CLASSIC + "Metamorphosis.pdf" },

  // ── Heart of Darkness / Conrad ────────────────────────────────────────────────
  { title: "Heart of Darkness",           author: "Joseph Conrad",      genre: "Classic",     fileSizeKb: 420,  featured: false, rawUrl: BASE_CLASSIC + "Heart%20Of%20Darkness.pdf" },
  { title: "Lord Jim",                    author: "Joseph Conrad",      genre: "Classic",     fileSizeKb: 1215, featured: false, rawUrl: BASE_CLASSIC + "Lord%20Jim.pdf" },

  // ── H.G. Wells ────────────────────────────────────────────────────────────────
  { title: "The War of the Worlds",       author: "H.G. Wells",         genre: "Science Fiction", fileSizeKb: 502, featured: true, rawUrl: BASE_CLASSIC + "The%20War%20Of%20The%20Worlds.pdf" },
  { title: "The Time Machine",            author: "H.G. Wells",         genre: "Science Fiction", fileSizeKb: 340, featured: true, rawUrl: BASE_CLASSIC + "The%20Time%20Machine.pdf" },
  { title: "The Invisible Man",           author: "H.G. Wells",         genre: "Science Fiction", fileSizeKb: 471, featured: false, rawUrl: BASE_CLASSIC + "The%20Invisible%20Man.pdf" },
  { title: "The Island of Doctor Moreau", author: "H.G. Wells",         genre: "Science Fiction", fileSizeKb: 387, featured: false, rawUrl: BASE_CLASSIC + "The%20Island%20Of%20Doctor%20Moreau.pdf" },
  { title: "Ann Veronica",                author: "H.G. Wells",         genre: "Classic",     fileSizeKb: 551,  featured: false, rawUrl: BASE_POPULAR + "Ann_Veronica.pdf" },
  { title: "A Modern Utopia",             author: "H.G. Wells",         genre: "Classic",     fileSizeKb: 1055, featured: false, rawUrl: BASE_CLASSIC + "A%20Modern%20Utopia.pdf" },
  { title: "A Columbus of Space",         author: "Garrett P. Serviss", genre: "Science Fiction", fileSizeKb: 814, featured: false, rawUrl: BASE_CLASSIC + "A%20Columbus%20Of%20Space.pdf" },

  // ── Oscar Wilde ───────────────────────────────────────────────────────────────
  { title: "The Picture of Dorian Gray",  author: "Oscar Wilde",        genre: "Classic",     fileSizeKb: 617,  featured: true,  rawUrl: BASE_CLASSIC + "The%20Picture%20Of%20Dorian%20Gray.pdf" },
  { title: "An Ideal Husband",            author: "Oscar Wilde",        genre: "Classic",     fileSizeKb: 494,  featured: false, rawUrl: BASE_CLASSIC + "An%20Ideal%20Husband.pdf" },
  { title: "A Woman of No Importance",    author: "Oscar Wilde",        genre: "Classic",     fileSizeKb: 345,  featured: false, rawUrl: BASE_CLASSIC + "A%20Woman%20of%20No%20Importance.pdf" },
  { title: "A House of Pomegranates",     author: "Oscar Wilde",        genre: "Classic",     fileSizeKb: 420,  featured: false, rawUrl: BASE_CLASSIC + "A%20House%20of%20Pomegranates.pdf" },
  { title: "Lady Windermere's Fan",       author: "Oscar Wilde",        genre: "Classic",     fileSizeKb: 306,  featured: false, rawUrl: BASE_CLASSIC + "Lady%20Windermere's%20Fan.pdf" },
  { title: "De Profundis",                author: "Oscar Wilde",        genre: "Classic",     fileSizeKb: 254,  featured: false, rawUrl: BASE_CLASSIC + "De%20Profundis.pdf" },

  // ── Rudyard Kipling ───────────────────────────────────────────────────────────
  { title: "The Jungle Book",             author: "Rudyard Kipling",    genre: "Classic",     fileSizeKb: 527,  featured: true,  rawUrl: BASE_CLASSIC + "The%20Jungle%20Book.pdf" },
  { title: "Kim",                         author: "Rudyard Kipling",    genre: "Classic",     fileSizeKb: 1074, featured: false, rawUrl: BASE_CLASSIC + "Kim.pdf" },
  { title: "Just So Stories",             author: "Rudyard Kipling",    genre: "Classic",     fileSizeKb: 375,  featured: false, rawUrl: BASE_CLASSIC + "Just%20So%20Stories.pdf" },
  { title: "Captains Courageous",         author: "Rudyard Kipling",    genre: "Classic",     fileSizeKb: 600,  featured: false, rawUrl: BASE_CLASSIC + "Captains%20Courageous.pdf" },

  // ── Jack London ───────────────────────────────────────────────────────────────
  { title: "White Fang",                  author: "Jack London",        genre: "Classic",     fileSizeKb: 801,  featured: false, rawUrl: BASE_CLASSIC + "White%20Fang.pdf" },
  { title: "The Call of the Wild",        author: "Jack London",        genre: "Classic",     fileSizeKb: 335,  featured: true,  rawUrl: BASE_CLASSIC + "The%20Call%20Of%20The%20Wild.pdf" },
  { title: "Adventure",                   author: "Jack London",        genre: "Classic",     fileSizeKb: 821,  featured: false, rawUrl: BASE_CLASSIC + "Adventure.pdf" },
  { title: "Martin Eden",                 author: "Jack London",        genre: "Classic",     fileSizeKb: 1354, featured: false, rawUrl: BASE_CLASSIC + "Martin%20Eden.pdf" },

  // ── H. Rider Haggard ─────────────────────────────────────────────────────────
  { title: "King Solomon's Mines",        author: "H. Rider Haggard",   genre: "Classic",     fileSizeKb: 853,  featured: true,  rawUrl: BASE_CLASSIC + "King%20Solomon's%20Mines.pdf" },
  { title: "She",                         author: "H. Rider Haggard",   genre: "Classic",     fileSizeKb: 1165, featured: false, rawUrl: BASE_CLASSIC + "She.pdf" },

  // ── Tarzan ────────────────────────────────────────────────────────────────────
  { title: "Tarzan of the Apes",          author: "Edgar Rice Burroughs", genre: "Classic",   fileSizeKb: 936,  featured: false, rawUrl: BASE_CLASSIC + "Tarzan%20Of%20The%20Apes.pdf" },

  // ── P.G. Wodehouse ────────────────────────────────────────────────────────────
  { title: "A Damsel in Distress",        author: "P.G. Wodehouse",     genre: "Classic",     fileSizeKb: 894,  featured: false, rawUrl: BASE_CLASSIC + "A%20Damsel%20In%20Distress.pdf" },
  { title: "My Man Jeeves",               author: "P.G. Wodehouse",     genre: "Classic",     fileSizeKb: 606,  featured: false, rawUrl: BASE_CLASSIC + "My%20Man%20Jeaves.pdf" },
  { title: "Right Ho, Jeeves",            author: "P.G. Wodehouse",     genre: "Classic",     fileSizeKb: 991,  featured: false, rawUrl: BASE_CLASSIC + "Right%20Ho%20Jeeves.pdf" },

  // ── G.K. Chesterton ──────────────────────────────────────────────────────────
  { title: "Orthodoxy",                   author: "G.K. Chesterton",    genre: "Philosophy",  fileSizeKb: 674,  featured: false, rawUrl: BASE_CLASSIC + "Orthodoxy.pdf" },
  { title: "Heretics",                    author: "G.K. Chesterton",    genre: "Philosophy",  fileSizeKb: 684,  featured: false, rawUrl: BASE_CLASSIC + "Heretics.pdf" },

  // ── D.H. Lawrence ────────────────────────────────────────────────────────────
  { title: "Women in Love",               author: "D.H. Lawrence",      genre: "Classic",     fileSizeKb: 1948, featured: false, rawUrl: BASE_CLASSIC + "Women%20In%20Love.pdf" },
  { title: "Sons and Lovers",             author: "D.H. Lawrence",      genre: "Classic",     fileSizeKb: 1649, featured: false, rawUrl: BASE_CLASSIC + "Sons%20And%20Lovers.pdf" },

  // ── Wilkie Collins ────────────────────────────────────────────────────────────
  { title: "Little Novels",              author: "Wilkie Collins",      genre: "Classic",     fileSizeKb: 310,  featured: false, rawUrl: "https://raw.githubusercontent.com/manjunath5496/classic-ebooks/master/1/Little%20Novels.pdf" },

  // ── Uncle Tom's Cabin ─────────────────────────────────────────────────────────
  { title: "Uncle Tom's Cabin",           author: "Harriet Beecher Stowe", genre: "Classic",  fileSizeKb: 1858, featured: false, rawUrl: BASE_CLASSIC + "Uncle%20Toms%20Cabin.pdf" },

  // ── Don Quixote ───────────────────────────────────────────────────────────────
  { title: "Don Quixote Vol. 1",          author: "Miguel de Cervantes", genre: "Classic",    fileSizeKb: 1944, featured: true,  rawUrl: BASE_CLASSIC + "Don%20Quixote%20Volume%201.pdf" },
  { title: "Don Quixote Vol. 2",          author: "Miguel de Cervantes", genre: "Classic",    fileSizeKb: 1886, featured: false, rawUrl: BASE_CLASSIC + "Don%20Quixote%20Volume%202.pdf" },

  // ── Technology — You Don't Know JS ───────────────────────────────────────────
  { title: "You Don't Know JS: Up & Going",              author: "Kyle Simpson", genre: "Technology", fileSizeKb: 3120, featured: true,  rawUrl: BASE_SHIVAM + "JS/You%20dont%20know%20js/1.%20You%20Dont%20Know%20JS%20Up%20%26%20Going.pdf" },
  { title: "You Don't Know JS: Scope & Closures",        author: "Kyle Simpson", genre: "Technology", fileSizeKb: 6245, featured: false, rawUrl: BASE_SHIVAM + "JS/You%20dont%20know%20js/2.%20You%20Dont%20Know%20JS.%20Scope%20%26%20Closures.pdf" },
  { title: "You Don't Know JS: this & Object Prototypes",author: "Kyle Simpson", genre: "Technology", fileSizeKb: 3187, featured: false, rawUrl: BASE_SHIVAM + "JS/You%20dont%20know%20js/3.%20You%20Dont%20Know%20JS.%20this%20%26%20Object%20Prototypes.pdf" },
  { title: "You Don't Know JS: Types & Grammar",         author: "Kyle Simpson", genre: "Technology", fileSizeKb: 4094, featured: false, rawUrl: BASE_SHIVAM + "JS/You%20dont%20know%20js/4.%20You%20Dont%20Know%20JS.%20Types%20%26%20Grammar.pdf" },
  { title: "You Don't Know JS: Async & Performance",     author: "Kyle Simpson", genre: "Technology", fileSizeKb: 1495, featured: false, rawUrl: BASE_SHIVAM + "JS/You%20dont%20know%20js/5.%20You%20Dont%20Know%20JS.%20Async%20%26%20Performance.pdf" },
  { title: "You Don't Know JS: ES6 & Beyond",            author: "Kyle Simpson", genre: "Technology", fileSizeKb: 6273, featured: false, rawUrl: BASE_SHIVAM + "JS/You%20dont%20know%20js/6.%20You%20Dont%20Know%20JS.%20ES6%20%26%20Beyond.pdf" },

  // ── Technology — System Design & Algorithms ───────────────────────────────────
  { title: "System Design Interview",     author: "Alex Xu",            genre: "Technology",  fileSizeKb: 2270, featured: true,  rawUrl: BASE_SHIVAM + "Coding/System%20Design%20Interview.pdf" },
  { title: "Elements of Programming Interviews (C++)", author: "Adnan Aziz", genre: "Technology", fileSizeKb: 6416, featured: false, rawUrl: BASE_SHIVAM + "Coding/elements-of-programming-interviews-adnan-aziz%20in%20C%2B%2B.pdf" },

  // ── Technology — Cloud ────────────────────────────────────────────────────────
  { title: "A Complete Guide to Cloud Computing", author: "Various", genre: "Technology",     fileSizeKb: 772,  featured: false, rawUrl: BASE_SHIVAM + "Cloud/A%20Complete%20Guide%20to%20Cloud%20Computing.pdf" },
  { title: "Cloud Security and Privacy",  author: "Tim Mather et al.",  genre: "Technology",  fileSizeKb: 3800, featured: false, rawUrl: BASE_SHIVAM + "Cloud/Cloud%20Security%20and%20Privacy.pdf" },

  // ── Mathematics ───────────────────────────────────────────────────────────────
  { title: "Concrete Mathematics",        author: "Graham, Knuth, Patashnik", genre: "Mathematics", fileSizeKb: 2893, featured: true, rawUrl: BASE_SHIVAM + "Maths/Concrete%20Mathematics%20-%20Graham%20-%20Knuth%20-%20Patashnik.pdf" },
  { title: "Discrete Mathematics for Computer Science", author: "Eric Lehman", genre: "Mathematics", fileSizeKb: 8109, featured: false, rawUrl: BASE_SHIVAM + "Maths/Discrete%20Mathematic%20for%20Computer%20Science.pdf" },
  { title: "Mathematics for Computer Science", author: "Eric Lehman et al.", genre: "Mathematics", fileSizeKb: 13082, featured: false, rawUrl: BASE_SHIVAM + "Maths/Mathematics%20for%20Computer%20Science%20-%20Eric%20Lehman.pdf" },

  // ── Science ───────────────────────────────────────────────────────────────────
  { title: "Relativity",                  author: "Albert Einstein",    genre: "Science",     fileSizeKb: 4179, featured: true,  rawUrl: BASE_SHIVAM + "Physics/Relativity.pdf" },
  { title: "The Theory of Everything",    author: "Stephen Hawking",    genre: "Science",     fileSizeKb: 5199, featured: true,  rawUrl: BASE_SHIVAM + "Physics/The%20theory%20of%20everything.pdf" },
  { title: "Beyond Einstein",             author: "Michio Kaku",        genre: "Science",     fileSizeKb: 5488, featured: false, rawUrl: BASE_SHIVAM + "Physics/Beyond-Einstein.pdf" },
  { title: "The Great Book of Puzzles and Teasers", author: "George Summers", genre: "Mathematics", fileSizeKb: 49480, featured: false, rawUrl: BASE_SHIVAM + "Physics/The_Great_Book_Of_Puzzles_And_Teasers.pdf" },
];

// ── Seeding ───────────────────────────────────────────────────────────────────

let seeded = false;

async function seedNovels(): Promise<void> {
  if (seeded) return;
  try {
    const countRows = await db.select({ c: sql<number>`count(*)` }).from(novelsTable);
    const existingCount = Number(countRows[0]?.c ?? 0);

    if (existingCount >= SEED_NOVELS.length) {
      seeded = true;
      return;
    }

    // Get existing titles to avoid duplicates
    const existingRows = await db.select({ title: novelsTable.title }).from(novelsTable);
    const existingTitles = new Set(existingRows.map(r => r.title.toLowerCase()));

    const toInsert = SEED_NOVELS.filter(n => !existingTitles.has(n.title.toLowerCase()));
    if (toInsert.length === 0) { seeded = true; return; }

    // Insert in batches of 50
    for (let i = 0; i < toInsert.length; i += 50) {
      await db.insert(novelsTable).values(
        toInsert.slice(i, i + 50).map(n => ({
          title: n.title,
          author: n.author,
          genre: n.genre,
          rawUrl: n.rawUrl,
          fileSizeKb: n.fileSizeKb,
          featured: n.featured,
        }))
      );
    }
    seeded = true;
    console.log(`Seeded ${toInsert.length} new novels (total: ${existingCount + toInsert.length})`);
  } catch (err) {
    console.error("Failed to seed novels", err);
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/", async (req, res): Promise<void> => {
  await seedNovels();
  const { search, genre, featured, limit: limitQ, offset: offsetQ } = req.query as Record<string, string>;

  const limit = Math.min(Number(limitQ) || 500, 1000);
  const offset = Math.max(Number(offsetQ) || 0, 0);

  try {
    const { and, count } = await import("drizzle-orm");
    const conditions = [];
    if (search) {
      conditions.push(
        or(
          ilike(novelsTable.title, `%${search}%`),
          ilike(novelsTable.author, `%${search}%`)
        )
      );
    }
    if (genre && genre !== "All") {
      conditions.push(eq(novelsTable.genre, genre));
    }
    if (featured === "true") {
      conditions.push(eq(novelsTable.featured, true));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      db.select().from(novelsTable).where(where).orderBy(novelsTable.title).limit(limit).offset(offset),
      db.select({ total: count() }).from(novelsTable).where(where),
    ]);

    res.json({ novels: rows, total: Number(total), hasMore: offset + rows.length < Number(total) });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch novels");
    res.status(500).json({ error: "Failed to fetch novels" });
  }
});

// Proxy novel PDF content (so users never see external GitHub URLs)
router.get("/proxy", async (req, res): Promise<void> => {
  const { id } = req.query as { id?: string };

  if (!id) {
    res.status(400).json({ error: "id is required" });
    return;
  }

  try {
    const rows = await db.select().from(novelsTable).where(eq(novelsTable.id, Number(id)));
    if (!rows.length) {
      res.status(404).json({ error: "Novel not found" });
      return;
    }

    const novel = rows[0];
    const rawUrl = novel.rawUrl;

    if (!rawUrl.startsWith("https://raw.githubusercontent.com/")) {
      res.status(403).json({ error: "Invalid source" });
      return;
    }

    const upstream = await fetch(rawUrl, {
      headers: { "User-Agent": "AI-Math-Solver-Dashboard/1.0" },
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Upstream returned ${upstream.status}` });
      return;
    }

    const contentType = upstream.headers.get("content-type") || "application/pdf";
    const contentLength = upstream.headers.get("content-length");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `inline; filename="${novel.title}.pdf"`);
    res.setHeader("Cache-Control", "public, max-age=86400");
    if (contentLength) res.setHeader("Content-Length", contentLength);

    const buffer = await upstream.arrayBuffer();
    res.end(Buffer.from(buffer));
  } catch (err) {
    req.log.error({ err }, "Novel proxy error");
    res.status(502).json({ error: "Failed to fetch novel content" });
  }
});

router.get("/genres", async (_req, res): Promise<void> => {
  res.json({
    genres: ["All", "Thriller", "Romance", "Classic", "Fantasy", "Fiction", "Philosophy", "Self-help", "Science Fiction", "Technology", "Mathematics", "Science"],
  });
});

export default router;
