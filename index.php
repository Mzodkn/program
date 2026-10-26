<?php
// ⚠️ تحذير: هذا الكود مصاب عمداً بثغرة Unrestricted File Upload لأغراض الاختبار المحلي فقط.

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['uploaded_file'])) {
    
    // تحديد مجلد الرفع (سيتم إنشاؤه إذا لم يكن موجوداً)
    $upload_dir = 'uploads/';
    if (!is_dir($upload_dir)) {
        mkdir($upload_dir, 0777, true);
    }

    // أخذ اسم الملف كما أرسله المستخدم (هنا تكمن الثغرة الأولى)
    $file_name = $_FILES['uploaded_file']['name'];
    $target_path = $upload_dir . $file_name;
    $tmp_path = $_FILES['uploaded_file']['tmp_name'];

    // ❌ الكارثة الأمنية: نقل الملف مباشرة دون فحص امتداده أو محتواه
    if (move_uploaded_file($tmp_path, $target_path)) {
        echo "<h3 style='color:green;'>تم رفع الملف بنجاح!</h3>";
        echo "<p>مسار الملف: <a href='$target_path' target='_blank'>$target_path</a></p>";
    } else {
        echo "<h3 style='color:red;'>فشل رفع الملف.</h3>";
    }
}
?>

<!-- نموذج الرفع HTML -->
<!DOCTYPE html>
<html lang="ar">
<head>
    <meta charset="UTF-8">
    <title>اختبار ثغرة File Upload</title>
</head>
<body>
    <h2>ارفع صورتك الشخصية (أو الشيل 😉):</h2>
    <!-- يجب أن يحتوي النموذج على enctype="multipart/form-data" -->
    <form action="" method="POST" enctype="multipart/form-data">
        <input type="file" name="uploaded_file" required>
        <button type="submit">رفع الملف</button>
    </form>
</body>
</html>
