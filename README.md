# File Upload/Download Backend Server

VS Code + Node.js + Postman/Thunder Client එකෙන් test කරන්න පුළුවන් backend server එකක්.

## 1. Setup කරන විදිය

1. VS Code එකෙන් මේ `backend-server` folder එක open කරන්න.
2. Terminal එකක් open කරන්න (`Ctrl + ~` ).
3. පහත command එක දාන්න dependencies install කරගන්න:

```bash
npm install
```

## 2. Server එක run කරන විදිය

```bash
npm start
```

Terminal එකේ මෙහෙම පේනවා නම් සාර්ථකයි:

```
✅ Server eka run wenawa: http://localhost:3000
📁 Uploads folder eka: .../uploads
```

(Code වෙනස් කරද්දී server එක auto-restart වෙන්න ඕන නම් `npm run dev` දාන්න - ඒකට `nodemon` install වෙන්න ඕන.)

## 3. Postman / Thunder Client එකෙන් Test කරන විදිය

### A. Server එක work කරනවද බලන්න
- Method: `GET`
- URL: `http://localhost:3000/`

### B. File එකක් Upload කරන්න
- Method: `POST`
- URL: `http://localhost:3000/upload`
- Body → **form-data** තෝරන්න
- Key: `file` (Type එක **File** ලෙස මාරු කරන්න — dropdown එකක් තියෙනවා Text/File කියලා)
- Value: ඔයාගේ පරිගණකයෙන් file එකක් select කරන්න
- Send කරන්න

Response එකේ `downloadUrl` එකක් එනවා, ඒක save කරගන්න.

### C. Files කිහිපයක් එකවර Upload කරන්න
- Method: `POST`
- URL: `http://localhost:3000/upload-multiple`
- Body → form-data → Key: `files` (Type: File) — files කිහිපයක්ම select කරන්න පුළුවන්

### D. Upload කරපු Files ලිස්ට් එක බලන්න
- Method: `GET`
- URL: `http://localhost:3000/files`

### E. File එකක් Download කරන්න
- Method: `GET`
- URL: `http://localhost:3000/download/FILE_NAME_EKA`
  (FILE_NAME_EKA තියෙන්නේ upload response එකේ `savedAs` field එකේ)

### F. File එකක් Delete කරන්න
- Method: `DELETE`
- URL: `http://localhost:3000/delete/FILE_NAME_EKA`

## 4. Folder Structure

```
backend-server/
├── server.js         → Main server code
├── package.json       → Dependencies list
├── uploads/            → Upload කරන files save වෙන්නේ මෙතන
└── README.md
```

## 5. ඊළඟට කරන්න පුළුවන් දේවල්

- Frontend (HTML/React) එකකින් මේ API endpoints call කරන්න පුළුවන් (`fetch` හෝ `axios` පාවිච්චි කරලා).
- File type validation (image/pdf විතරක් allow කරන්න වගේ) දාන්න පුළුවන්.
- Database එකක් (MongoDB/MySQL) සම්බන්ධ කරලා file metadata save කරගන්න පුළුවන්.
