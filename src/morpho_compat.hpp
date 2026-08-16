/***************************************************************************
* Copyright (c) 2026, Tim Atherton
*
* Distributed under the terms of the MIT license.
*
* The full license is in the file LICENSE, distributed with this software.
****************************************************************************/

#ifndef XEUS_MORPHO_MORPHO_COMPAT_HPP
#define XEUS_MORPHO_MORPHO_COMPAT_HPP

extern "C" {
#include <morpho.h>
#include <varray.h>
}

/*
 * Morpho's common.h is not safe to include from C++ here: cmplx.h pulls
 * <complex.h> (libc++ <complex>) and platform.h then uses C99
 * `double complex`. These declarations match common.h so the kernel can
 * still call Morpho's I/O and UTF-8 helpers without duplicating them in
 * the installed public header.
 */

extern "C" {

typedef enum {
    MORPHO_INPUT_KEYPRESS,
    MORPHO_INPUT_LINE
} morphoinputmode;

typedef void (*morphoinputfn) (vm *v, void *ref, morphoinputmode mode, varray_char *str);
typedef void (*morphoprintfn) (vm *v, void *ref, char *str);
typedef void (*morphowarningfn) (vm *v, void *ref, error *warning);

void morpho_setwarningfn(vm *v, morphowarningfn warningfn, void *ref);
void morpho_setprintfn(vm *v, morphoprintfn printfn, void *ref);
void morpho_setinputfn(vm *v, morphoinputfn inputfn, void *ref);

int morpho_utf8numberofbytes(const char *string);

}

#endif
