vardef pascal(expr C) =
forever:
pair A[], M[];
for i=0 upto 5:
A[i] := point uniformdeviate(length(C)) of C;
endfor;
M[0] = whatever[ A[0], A[1] ];
M[0] = whatever[ A[3], A[4] ];
M[1] = whatever[ A[1], A[2] ];
M[1] = whatever[ A[4], A[5] ];
M[2] = whatever[ A[2], A[3] ];
M[2] = whatever[ A[5], A[0] ];
exitif check_pascal;
endfor;
draw C;
draw A[0]--A[1] withcolor red;
draw A[3]--A[4] withcolor red;
draw A[0]--M[0] withcolor red dashed evenly;
draw A[3]--M[0] withcolor red dashed evenly;
draw A[1]--A[2] withcolor green;
draw A[4]--A[5] withcolor green;
draw A[1]--M[1] withcolor green dashed evenly;
draw A[4]--M[1] withcolor green dashed evenly;
draw A[2]--A[3] withcolor blue;
draw A[5]--A[0] withcolor blue;
draw A[2]--M[2] withcolor blue dashed evenly;
draw A[5]--M[2] withcolor blue dashed evenly;
draw M[0]--M[1]--M[2]--cycle withpen pencircle scaled 2bp;
for i=0 upto 2:
draw M[i] withpen pencircle scaled 6bp;
endfor;
for i=0 upto 5:
draw A[i] withpen pencircle scaled 6bp;
endfor;
enddef;
pascal(fullcircle xscaled 6cm yscaled 3cm);
rescale_currentpic;
