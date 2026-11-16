package dev.example.nod;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.util.AttributeSet;
import android.view.View;

import androidx.core.content.ContextCompat;

/** The four corner caps of the scan frame. They turn green when a code is found. */
public class ViewfinderView extends View {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path path = new Path();
    private final float stroke;
    private final float arm;

    public ViewfinderView(Context context, AttributeSet attrs) {
        super(context, attrs);
        float dp = getResources().getDisplayMetrics().density;
        stroke = 6 * dp;
        arm = 44 * dp;
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(stroke);
        paint.setStrokeCap(Paint.Cap.SQUARE);
        setFound(false);
    }

    public void setFound(boolean found) {
        paint.setColor(ContextCompat.getColor(getContext(), found ? R.color.fg_success : R.color.fg_default));
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        float s = stroke / 2;
        float w = getWidth() - s;
        float h = getHeight() - s;
        path.reset();
        path.moveTo(s, s + arm);
        path.lineTo(s, s);
        path.lineTo(s + arm, s);
        path.moveTo(w - arm, s);
        path.lineTo(w, s);
        path.lineTo(w, s + arm);
        path.moveTo(w, h - arm);
        path.lineTo(w, h);
        path.lineTo(w - arm, h);
        path.moveTo(s + arm, h);
        path.lineTo(s, h);
        path.lineTo(s, h - arm);
        canvas.drawPath(path, paint);
    }
}
