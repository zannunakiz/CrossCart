CONTENT: (main)/pos full update

UI: responsive tablet/mobile/desktop/random size
UI: shadcn library components, cursor pointer for button, proper disabling buttons and loading states when fetching etc.
OVERALL DESIGN SIZE: saya mau size design tidak usah terlalu besar besar, karena saya lebih suka style kecil-medium lebih enak dipandang. Dan bisa menghindari UI collisions.
Accessibility: ID language and EN language 100%
Design: minimalistic seperti di root "/" page
TOAST: shadcn sonner
Anmation render: Framer Motion

New DB: pos*item, pos_history, and other pos*\* related db needed

DB: based on what i said please make the schema "pos" creatively, scalable, flexible, proper index, RBAC POS best practice jadi bukan sekedar admin/master role, ada permissions based role industry RBAC, make sure db:migrate works. Be creative for DB.

About POS DB:

- hanya Master bisa edit store data
- POS_store: name(max 20), description (max 100), image (cloudinary), open (boolean), telephone (max berapa), owner, currency (USD/IDR), etc pokoknya buat yang bagus
- POS_item: name, description, image, available boolean, stoks, price, etc....
- POS_category : etc..
- dan POS database lain buat sendiri scalable maintanable
- invite member by email

About POS system:

- customer bisa datang ke resto dan scan QR masuk ke customer order view (tidak perlu login, hanya perlu name for order)
- customer buat order
- tidak ada payment gateaway karena app saya free money involvemment
- setelah buat order customer akan generate payload atau QR
- customer jalan ke kasir tunjukkin QR or code
- kasir bisa scan QR or input code
- Validasi jumlah stok, etc pokoknya validasi all good
- generate struk dan button countdown 3 second "Confirm"
- setelah kasir pencet confirm, button akan menghlang berubah jadi tulisan "Customer Paid ?/Bahasa indonya apa" dan ada tombol "yes" "no". Kalau no kembali ke state confirm semula, kalau yes maka order selesai.
- kasir juga bisa ganti amount or add item, missal setelah customer scan dan tampilan kasir muncul, dan customer bilang ke kasir "eh aku mau tambah x, dan extra sambal pada menu y". kasir bisa manipulasi data order in place.
- history, update stocks etc.
- JANGAN LUPA SEMUA ADA VERSI ID/EN Language.

About POS system:

- akan ada page yang melakukan websocket ini page untuk tim kitchen atau chef, seperti idle screen, yang menunjukkan order apa aja yang masuk sehingga tim kitchen bisa segera prepare.

CRUD advanced:

- CRUD proper RBAC
- CRUD proper live update on changes
- CRUD proper pagination fetch/filter/sort, etc, supaya ga overload
- UX performance, scalable, karena bisa jadi ada ribuan item.
- PROPER caching system.
- pastikan performa web baik.
- NEXTJS best practice server and client components.

NOTE:
understand all possible flaw possibility and prevent that, make good system like senior engineer.
my prompt may not be perfect, please be creative to fill in the gaps and make sure all works
For DB, make it scalable, feel free to make what the proper DB is, or howmany tables are.

GOAL:
lint works, build works, validate all changes.

{Prompt end}

what you do?
prompt diatas sudah berjalan Sebagian, tapi Waktu itu AI agent tokenku habis, jadi tidak semua terpenuhi, lanjutkan sisanya sampai POS ready.
